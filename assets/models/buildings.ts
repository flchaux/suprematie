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
  },  // furnace_n2 : fonderie améliorée (automatisation) : même bloc, échangeurs de chaleur ambrés sur les
  // flancs, seconde cheminée et soufflerie sur le toit
  furnace_n2: {
    parts: [
      ...socle(2),
      ...filets(2, 2, false),
      { shape: "bevel", size: [1.66,1.2,1.56], pos: [0,0.85,-0.06], color: "dark" },
      { shape: "bevel", size: [0.36,1.04,0.36], pos: [0.7,0.78,0.62], color: "light", mirror: true },
      { shape: "bevel", size: [0.36,1.04,0.36], pos: [0.7,0.78,-0.66], color: "light", mirror: true },
      { shape: "box", size: [0.08,0.05,0.03], pos: [0.7,1.12,0.81], color: "amber", mirror: true },
      // gueule du four, élargie
      { shape: "bevel", size: [1.04,0.8,0.12], pos: [0,0.76,0.74], bevel: 0.04, color: "black" },
      { shape: "box", size: [0.86,0.6,0.06], pos: [0,0.72,0.79], color: "amber" },
      { shape: "bevel", size: [1.12,0.16,0.22], pos: [0,1.2,0.72], color: "light" },
      // échangeurs de chaleur sur les flancs : ailettes et liseré ambre
      { shape: "bevel", size: [0.14,0.7,0.9], pos: [0.86,0.78,-0.06], color: "metal", mirror: true },
      { shape: "box", size: [0.03,0.5,0.04], pos: [0.94,0.78,0.2], color: "amber", mirror: true },
      { shape: "box", size: [0.03,0.5,0.04], pos: [0.94,0.78,-0.06], color: "amber", mirror: true },
      { shape: "box", size: [0.03,0.5,0.04], pos: [0.94,0.78,-0.32], color: "amber", mirror: true },
      // toit aux couleurs de l'équipe (centre dégagé pour l'icône de la recette)
      { shape: "bevel", size: [1.5,0.14,1.4], pos: [0,1.52,-0.08], color: "faction" },
      { shape: "box", size: [1.2,0.03,0.03], pos: [0,1.6,0.6], color: "amber" },
      // deux cheminées aux coins arrière
      { shape: "cylinder", sides: 8, radius: 0.22, height: 0.18, pos: [0.54,1.67,-0.56], color: "metal", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.16, height: 0.55, pos: [0.54,2.0,-0.56], color: "dark", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.2, height: 0.08, pos: [0.54,2.29,-0.56], color: "metal", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.12, height: 0.02, pos: [0.54,2.34,-0.56], color: "amber", mirror: true },
      // soufflerie à l'avant gauche du toit
      { shape: "cylinder", sides: 8, radius: 0.2, height: 0.12, pos: [-0.5,1.65,0.42], color: "metal" },
      { shape: "cylinder", sides: 6, radius: 0.15, height: 0.03, pos: [-0.5,1.72,0.42], color: "dark", pivot: "rotor" },
    ],
  },
  // furnace_n3 : fonderie à induction (électronique) : bloc rehaussé, creuset ceint de bobines cyan
  // lumineuses, ailettes de refroidissement et cheminée haute
  furnace_n3: {
    parts: [
      ...socle(2),
      ...filets(2),
      { shape: "bevel", size: [1.7,1.36,1.6], pos: [0,0.93,-0.06], color: "dark" },
      { shape: "bevel", size: [0.36,1.2,0.36], pos: [0.7,0.86,0.62], color: "light", mirror: true },
      { shape: "bevel", size: [0.36,1.2,0.36], pos: [0.7,0.86,-0.66], color: "light", mirror: true },
      { shape: "box", size: [0.08,0.05,0.03], pos: [0.7,1.3,0.81], color: "glow", mirror: true },
      // gueule : plaque vitrée chauffée à blanc, cadre clair
      { shape: "bevel", size: [1.04,0.86,0.12], pos: [0,0.8,0.76], bevel: 0.04, color: "black" },
      { shape: "box", size: [0.86,0.66,0.06], pos: [0,0.78,0.81], color: "amber" },
      { shape: "box", size: [0.86,0.04,0.07], pos: [0,0.5,0.82], color: "glow" },
      { shape: "bevel", size: [1.12,0.16,0.22], pos: [0,1.3,0.74], color: "light" },
      // ailettes de refroidissement sur les flancs
      { shape: "box", size: [0.12,0.9,0.06], pos: [0.88,0.86,0.3], color: "metal", mirror: true },
      { shape: "box", size: [0.12,0.9,0.06], pos: [0.88,0.86,0.06], color: "metal", mirror: true },
      { shape: "box", size: [0.12,0.9,0.06], pos: [0.88,0.86,-0.18], color: "metal", mirror: true },
      { shape: "box", size: [0.12,0.9,0.06], pos: [0.88,0.86,-0.42], color: "metal", mirror: true },
      // toit d'équipe ; bobines d'induction aux trois coins libres (centre laissé à l'icône de la recette)
      { shape: "bevel", size: [1.5,0.14,1.4], pos: [0,1.68,-0.08], color: "faction" },
      ...([[-0.56,0.44],[0.56,0.44],[-0.56,-0.62]] as const).flatMap(([x, z]): Part[] => [
        { shape: "cylinder", sides: 8, radius: 0.16, height: 0.08, pos: [x,1.79,z], color: "metal" },
        { shape: "cylinder", sides: 8, radius: 0.11, height: 0.3, pos: [x,1.98,z], color: "glow" },
        { shape: "cylinder", sides: 8, radius: 0.15, height: 0.04, pos: [x,1.94,z], color: "metal" },
        { shape: "cylinder", sides: 8, radius: 0.15, height: 0.04, pos: [x,2.06,z], color: "metal" },
        { shape: "cylinder", sides: 8, radius: 0.13, height: 0.05, pos: [x,2.15,z], color: "dark" },
      ]),
      // cheminée haute dans le coin arrière droit
      { shape: "cylinder", sides: 8, radius: 0.2, height: 0.2, pos: [0.6,1.84,-0.62], color: "metal" },
      { shape: "cylinder", sides: 8, radius: 0.14, height: 0.7, pos: [0.6,2.28,-0.62], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.18, height: 0.06, pos: [0.6,2.64,-0.62], color: "metal" },
      { shape: "cylinder", sides: 8, radius: 0.1, height: 0.02, pos: [0.6,2.68,-0.62], color: "glow" },
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
  // generator : turbine couchée à carter tourné (bandeau d'équipe, prise d'air à hélice et ogive ambre) sur
  // berceaux de béton, échappement coudé, deux bobines de cuivre à anneaux lumineux et coiffes, câbles gainés,
  // coffret de commande ; pièces fines : cerclages, traversées isolantes, presse-étoupes
  generator: {
    parts: [
      ...socle(2),
      ...filets(2),
      // dalle et berceaux de béton
      { shape: "bevel", size: [1.1,0.06,1.5], pos: [-0.38,0.28,-0.07], bevel: 0.02, color: "concrete" },
      ...[-0.42, 0.28].map((z): Part => ({ shape: "extrude", profile: [[-0.4,0],[0.4,0],[0.4,0.34],[0.32,0.34],[0.28,0.27],[0.14,0.2],[-0.14,0.2],[-0.28,0.27],[-0.32,0.34],[-0.4,0.34]], depth: 0.14, bevel: 0.02, pos: [-0.38,0.31,z], color: "concrete" })),
      // turbine : carter tourné (axe avant-arrière), bandeau d'équipe, cerclages, filet
      { shape: "lathe", sides: 16, pos: [-0.38,0.95,0], rot: [90,0,0], color: "light", profile: [[0,-0.72],[0.2,-0.7],[0.34,-0.62],[0.43,-0.5],[0.46,-0.36],[0.46,0.3],[0.5,0.34],[0.5,0.5],[0.46,0.56],[0.42,0.56],[0.42,0.47],[0,0.47]] },
      { shape: "cylinder", sides: 16, radius: 0.48, height: 0.42, pos: [-0.38,0.95,-0.12], rot: [90,0,0], color: "faction" },
      ...[-0.42, 0.2].map((z): Part => ({ shape: "torus", radius: 0.465, tube: 0.022, sides: 16, pos: [-0.38,0.95,z], rot: [90,0,0], color: "steel", fine: true })),
      { shape: "box", size: [0.03,0.05,0.6], pos: [-0.85,0.95,-0.05], color: "glow" },
      { shape: "bevel", size: [0.3,0.05,0.3], pos: [-0.38,1.42,-0.12], bevel: 0.015, color: "dark" },
      ...[-0.22, -0.12, -0.02].map((z): Part => ({ shape: "box", size: [0.24,0.02,0.04], pos: [-0.38,1.45,z], color: "black", fine: true })),
      // prise d'air : fond noir, pales d'acier, ogive
      { shape: "cylinder", sides: 16, radius: 0.42, height: 0.02, pos: [-0.38,0.95,0.48], rot: [90,0,0], color: "black" },
      ...[10, 55, 100, 145].map((a): Part => ({ shape: "box", size: [0.76,0.08,0.015], pos: [-0.38,0.95,0.52], rot: [0,0,a], color: "steel" })),
      { shape: "lathe", sides: 10, pos: [-0.38,0.95,0.49], rot: [90,0,0], color: "steel", profile: [[0,0],[0.1,0],[0.1,0.04],[0.08,0.09],[0.04,0.13],[0,0.14]] },
      { shape: "sphere", radius: 0.04, pos: [-0.38,0.95,0.63], color: "amber" },
      // échappement coudé à l'arrière
      { shape: "tube", radius: 0.07, sides: 10, path: [[-0.38,0.95,-0.66],[-0.38,0.95,-0.84],[-0.38,1.3,-0.84]], bend: 0.12, color: "steel" },
      { shape: "torus", radius: 0.075, tube: 0.018, sides: 10, pos: [-0.38,1.26,-0.84], color: "dark", fine: true },
      // bobine arrière : embase, enroulement de cuivre, anneaux lumineux, coiffe d'équipe, traversée isolante
      { shape: "cylinder", sides: 12, radius: 0.34, height: 0.06, bevel: 0.015, pos: [0.55,0.28,-0.45], color: "steel" },
      { shape: "cylinder", sides: 12, radius: 0.28, height: 0.88, pos: [0.55,0.75,-0.45], color: "copper" },
      ...[0.55, 0.75, 0.95].map((y): Part => ({ shape: "cylinder", sides: 12, radius: 0.305, height: 0.05, pos: [0.55,y,-0.45], color: "glow" })),
      { shape: "cylinder", sides: 12, radius: 0.36, height: 0.14, bevel: 0.03, pos: [0.55,1.25,-0.45], color: "faction" },
      { shape: "cylinder", sides: 8, radius: 0.2, height: 0.05, pos: [0.55,1.33,-0.45], color: "dark" },
      { shape: "lathe", sides: 8, pos: [0.55,1.34,-0.45], color: "light", fine: true, profile: [[0.06,0],[0.085,0.02],[0.06,0.04],[0.085,0.06],[0.06,0.08],[0.04,0.12],[0,0.13]] },
      { shape: "box", size: [0.08,0.05,0.03], pos: [0.55,1.25,-0.09], color: "amber" },
      // bobine avant, coiffe claire
      { shape: "cylinder", sides: 12, radius: 0.31, height: 0.06, bevel: 0.015, pos: [0.6,0.28,0.4], color: "steel" },
      { shape: "cylinder", sides: 12, radius: 0.25, height: 0.66, pos: [0.6,0.64,0.4], color: "copper" },
      ...[0.55, 0.78].map((y): Part => ({ shape: "cylinder", sides: 12, radius: 0.275, height: 0.05, pos: [0.6,y,0.4], color: "glow" })),
      { shape: "cylinder", sides: 12, radius: 0.32, height: 0.12, bevel: 0.03, pos: [0.6,1.03,0.4], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.16, height: 0.04, pos: [0.6,1.1,0.4], color: "faction" },
      { shape: "lathe", sides: 8, pos: [0.6,1.11,0.4], color: "light", fine: true, profile: [[0.05,0],[0.075,0.02],[0.05,0.04],[0.075,0.06],[0.05,0.08],[0.035,0.11],[0,0.12]] },
      // câbles gainés de la turbine aux bobines, presse-étoupes
      { shape: "tube", radius: 0.045, path: [[0.0,1.12,-0.4],[0.12,1.3,-0.42],[0.3,1.3,-0.45]], bend: 0.1, color: "rubber" },
      { shape: "tube", radius: 0.045, path: [[0.04,0.7,0.12],[0.22,0.7,0.2],[0.38,0.7,0.36]], bend: 0.1, color: "rubber" },
      { shape: "tube", radius: 0.04, path: [[0.55,0.36,-0.15],[0.55,0.36,0.0],[0.6,0.36,0.12]], bend: 0.08, color: "rubber" },
      { shape: "cylinder", sides: 8, radius: 0.06, height: 0.06, pos: [0.29,1.3,-0.45], rot: [0,0,90], color: "steel", fine: true },
      { shape: "cylinder", sides: 8, radius: 0.06, height: 0.06, pos: [0.37,0.7,0.35], rot: [0,0,90], color: "steel", fine: true },
      // coffret de commande à écran et voyant
      { shape: "bevel", size: [0.3,0.36,0.2], pos: [0.12,0.45,0.8], bevel: 0.03, color: "light" },
      { shape: "box", size: [0.2,0.08,0.01], pos: [0.12,0.52,0.905], color: "glow" },
      { shape: "box", size: [0.08,0.06,0.03], pos: [0.12,0.38,0.9], color: "amber" },
      { shape: "box", size: [0.26,0.03,0.16], pos: [0.12,0.645,0.8], color: "faction" },
    ],
  },
  // generator_n2 : niveau 2, turbine agrandie à anneau lumineux d'entrée d'air, carter cerclé et radiateur à
  // ailettes sur le dessus, trois bobines de cuivre en rang (dont une haute à quatre anneaux), câbles épais à
  // colliers ambre ; pièces fines : cerclages, conduites du radiateur, traversées isolantes
  generator_n2: {
    parts: [
      ...socle(2),
      ...filets(2),
      { shape: "bevel", size: [1.16,0.06,1.56], pos: [-0.33,0.28,-0.08], bevel: 0.02, color: "concrete" },
      ...[-0.45, 0.3].map((z): Part => ({ shape: "extrude", profile: [[-0.42,0],[0.42,0],[0.42,0.36],[0.33,0.36],[0.3,0.3],[0.15,0.22],[-0.15,0.22],[-0.3,0.3],[-0.33,0.36],[-0.42,0.36]], depth: 0.14, bevel: 0.02, pos: [-0.33,0.31,z], color: "concrete" })),
      // turbine agrandie, anneau lumineux d'entrée d'air
      { shape: "lathe", sides: 16, pos: [-0.33,1.006,0], rot: [90,0,0], color: "light", profile: [[0,-0.78],[0.22,-0.76],[0.37,-0.67],[0.46,-0.54],[0.5,-0.39],[0.5,0.32],[0.54,0.37],[0.54,0.54],[0.5,0.6],[0.45,0.6],[0.45,0.51],[0,0.51]] },
      { shape: "cylinder", sides: 16, radius: 0.515, height: 0.3, pos: [-0.33,1.006,-0.05], rot: [90,0,0], color: "faction" },
      ...[-0.3, 0.2].map((z): Part => ({ shape: "cylinder", sides: 16, radius: 0.52, height: 0.05, pos: [-0.33,1.006,z], rot: [90,0,0], color: "dark" })),
      ...[-0.5, 0.27].map((z): Part => ({ shape: "torus", radius: 0.5, tube: 0.02, sides: 16, pos: [-0.33,1.006,z], rot: [90,0,0], color: "steel", fine: true })),
      { shape: "torus", radius: 0.49, tube: 0.03, sides: 16, pos: [-0.33,1.006,0.6], rot: [90,0,0], color: "glow" },
      { shape: "box", size: [0.03,0.05,0.6], pos: [-0.84,1.006,-0.05], color: "glow" },
      { shape: "cylinder", sides: 16, radius: 0.45, height: 0.02, pos: [-0.33,1.006,0.52], rot: [90,0,0], color: "black" },
      ...[10, 55, 100, 145].map((a): Part => ({ shape: "box", size: [0.82,0.09,0.015], pos: [-0.33,1.006,0.56], rot: [0,0,a], color: "steel" })),
      { shape: "lathe", sides: 10, pos: [-0.33,1.006,0.53], rot: [90,0,0], color: "steel", profile: [[0,0],[0.11,0],[0.11,0.04],[0.09,0.1],[0.045,0.14],[0,0.15]] },
      { shape: "sphere", radius: 0.045, pos: [-0.33,1.006,0.68], color: "amber" },
      { shape: "tube", radius: 0.075, sides: 10, path: [[-0.33,1.0,-0.72],[-0.33,1.0,-0.88],[-0.33,1.4,-0.88]], bend: 0.13, color: "steel" },
      // radiateur à ailettes sur le carter, conduites
      { shape: "bevel", size: [0.5,0.16,0.62], pos: [-0.33,1.56,-0.22], bevel: 0.03, color: "dark" },
      ...[-0.2, -0.1, 0, 0.1, 0.2].map((dx): Part => ({ shape: "box", size: [0.04,0.12,0.56], pos: [-0.33 + dx,1.65,-0.22], color: "steel" })),
      { shape: "box", size: [0.46,0.02,0.03], pos: [-0.33,1.62,0.1], color: "glow" },
      ...[-0.53, -0.13].map((x): Part => ({ shape: "tube", radius: 0.03, path: [[x,1.4,-0.45],[x,1.52,-0.45]], color: "copper", fine: true })),
      // bobines en rang sur la droite
      ...[[0.6,-0.58,0.27,1.1],[0.62,0.04,0.25,0.85],[0.62,0.63,0.23,0.6]].flatMap(([x, z, r, h], i): Part[] => [
        { shape: "cylinder", sides: 12, radius: r + 0.06, height: 0.06, bevel: 0.015, pos: [x,0.28,z], color: "steel" },
        { shape: "cylinder", sides: 12, radius: r, height: h, pos: [x,0.31 + h / 2,z], color: "copper" },
        ...[0.55, 0.75, 0.95, 1.15].filter((y) => y < 0.25 + h).map((y): Part => ({ shape: "cylinder", sides: 12, radius: r + 0.025, height: 0.05, pos: [x,y,z], color: "glow" })),
        { shape: "cylinder", sides: 12, radius: r + 0.06, height: 0.14, bevel: 0.03, pos: [x,0.38 + h,z], color: i === 2 ? "light" : "faction" },
        { shape: "cylinder", sides: 8, radius: r * 0.6, height: 0.04, pos: [x,0.46 + h,z], color: i === 2 ? "faction" : "dark" },
        { shape: "lathe", sides: 8, pos: [x,0.47 + h,z], color: "light", fine: true, profile: [[0.05,0],[0.075,0.02],[0.05,0.04],[0.075,0.06],[0.05,0.08],[0.035,0.11],[0,0.12]] },
      ]),
      // câbles épais, colliers ambre
      { shape: "tube", radius: 0.06, path: [[-0.05,1.38,-0.5],[0.15,1.44,-0.5],[0.33,1.44,-0.56]], bend: 0.1, color: "rubber" },
      { shape: "tube", radius: 0.06, path: [[0.04,1.18,0.04],[0.36,1.18,0.04]], color: "rubber" },
      { shape: "tube", radius: 0.05, path: [[0.0,0.75,0.4],[0.2,0.75,0.55],[0.4,0.75,0.6]], bend: 0.1, color: "rubber" },
      { shape: "box", size: [0.06,0.16,0.16], pos: [0.2,1.44,-0.51], color: "amber" },
      { shape: "box", size: [0.06,0.16,0.16], pos: [0.24,1.18,0.04], color: "amber" },
      // coffret de commande
      { shape: "bevel", size: [0.26,0.34,0.18], pos: [0.1,0.44,0.83], bevel: 0.03, color: "light" },
      { shape: "box", size: [0.18,0.07,0.01], pos: [0.1,0.5,0.925], color: "glow" },
      { shape: "box", size: [0.08,0.06,0.03], pos: [0.1,0.37,0.92], color: "amber" },
    ],
  },
  // generator_n3 : niveau 3, turbine double sous un carénage à évents lumineux, tour de refroidissement
  // hyperbolique fumante, haute bobine de cuivre à cinq anneaux, cheminée à bagues, plaque cerclée d'un rebord
  // blindé à bande de danger ; pièces fines : boulons, louvres, cerclages, échelle, traversées
  generator_n3: {
    parts: [
      ...socle(2),
      ...filets(2),
      // plaque renforcée : rebord blindé, bande de danger à l'avant, coins boulonnés
      { shape: "box", size: [0.1,0.08,1.84], pos: [0.9,0.29,0], color: "steel", mirror: true },
      { shape: "box", size: [1.84,0.08,0.1], pos: [0,0.29,-0.9], color: "steel" },
      { shape: "box", size: [1.5,0.06,0.1], pos: [0,0.28,0.9], color: "hazard" },
      { shape: "box", size: [0.2,0.14,0.2], pos: [0.88,0.32,0.88], color: "light", mirror: true },
      { shape: "box", size: [0.2,0.14,0.2], pos: [0.88,0.32,-0.88], color: "light", mirror: true },
      ...[[0.84,0.84],[0.92,0.92],[0.84,-0.84],[0.92,-0.92]].map(([x, z]): Part => ({ shape: "cylinder", sides: 6, radius: 0.022, height: 0.03, pos: [x,0.4,z], color: "dark", mirror: true, fine: true })),
      // turbine double : carters tournés, anneaux lumineux d'entrée d'air, pales, ogives
      { shape: "box", size: [1.8,0.08,1.0], pos: [0,0.29,0.24], color: "concrete" },
      { shape: "lathe", sides: 16, pos: [0.45,0.796,0.3], rot: [90,0,0], color: "light", mirror: true, profile: [[0,-0.56],[0.22,-0.52],[0.33,-0.42],[0.36,-0.28],[0.36,0.23],[0.39,0.27],[0.39,0.44],[0,0.44]] },
      { shape: "torus", radius: 0.36, tube: 0.025, sides: 16, pos: [0.45,0.796,0.74], rot: [90,0,0], color: "glow", mirror: true },
      { shape: "cylinder", sides: 16, radius: 0.33, height: 0.02, pos: [0.45,0.796,0.745], rot: [90,0,0], color: "black", mirror: true },
      ...[10, 70, 130].map((a): Part => ({ shape: "box", size: [0.6,0.07,0.015], pos: [0.45,0.796,0.76], rot: [0,0,a], color: "steel", mirror: true })),
      { shape: "cone", sides: 10, radius: 0.08, height: 0.12, pos: [0.45,0.796,0.81], rot: [90,0,0], color: "steel", mirror: true },
      { shape: "box", size: [0.05,0.05,0.03], pos: [0.45,0.796,0.875], color: "amber", mirror: true },
      { shape: "extrude", profile: [[-0.3,0],[0.3,0],[0.3,0.2],[0.2,0.2],[0.12,0.13],[-0.12,0.13],[-0.2,0.2],[-0.3,0.2]], depth: 0.12, pos: [0.45,0.33,0.62], color: "concrete", mirror: true, fine: true },
      // carénage profilé, dessus d'équipe, évents lumineux
      { shape: "extrude", profile: [[-0.91,0],[0.91,0],[0.91,0.34],[0.76,0.5],[-0.76,0.5],[-0.91,0.34]], depth: 0.56, bevel: 0.03, pos: [0,0.75,0.04], color: "dark" },
      { shape: "bevel", size: [1.5,0.08,0.46], pos: [0,1.28,0.04], bevel: 0.025, color: "faction" },
      { shape: "box", size: [0.5,0.05,0.03], pos: [0,1.1,0.335], color: "glow" },
      { shape: "box", size: [0.5,0.05,0.03], pos: [0,0.96,0.335], color: "glow" },
      ...[-0.1, 0.04, 0.18].map((z): Part => ({ shape: "box", size: [1.2,0.04,0.06], pos: [0,1.33,z], color: "glow" })),
      ...[-0.03, 0.11].map((z): Part => ({ shape: "box", size: [1.24,0.05,0.03], pos: [0,1.34,z], color: "black", fine: true })),
      { shape: "box", size: [0.1,0.06,0.03], pos: [0.7,1.0,0.335], color: "amber", mirror: true },
      // tour de refroidissement hyperbolique, bandeau d'équipe, panache
      { shape: "lathe", sides: 16, pos: [-0.52,0,-0.56], color: "light", profile: [[0.35,0.25],[0.31,0.6],[0.27,0.95],[0.26,1.2],[0.28,1.5],[0.31,1.72],[0.32,1.77],[0.28,1.77],[0.26,1.62]] },
      { shape: "cylinder", sides: 12, radius: 0.27, height: 0.02, pos: [-0.52,1.62,-0.56], color: "black" },
      { shape: "cylinder", sides: 12, radius: 0.275, height: 0.14, pos: [-0.52,1.15,-0.56], color: "faction" },
      { shape: "torus", radius: 0.285, tube: 0.022, sides: 16, pos: [-0.52,0.98,-0.56], color: "glow" },
      { shape: "sphere", radius: 0.27, detail: 1, pos: [-0.52,1.86,-0.56], scale: [1,0.45,1], color: "light" },
      { use: "echelle", pos: [-0.52,0.3,-0.23], scale: [0.7,1.2,1] },
      // haute bobine à cinq anneaux, sphère lumineuse
      { shape: "cylinder", sides: 12, radius: 0.32, height: 0.06, bevel: 0.015, pos: [0.55,0.28,-0.56], color: "steel" },
      { shape: "cylinder", sides: 12, radius: 0.26, height: 1.3, pos: [0.55,0.96,-0.56], color: "copper" },
      ...[0.55, 0.75, 0.95, 1.15, 1.35].map((y): Part => ({ shape: "cylinder", sides: 12, radius: 0.285, height: 0.05, pos: [0.55,y,-0.56], color: "glow" })),
      { shape: "cylinder", sides: 12, radius: 0.32, height: 0.14, bevel: 0.03, pos: [0.55,1.65,-0.56], color: "faction" },
      { shape: "sphere", radius: 0.1, pos: [0.55,1.78,-0.56], color: "glow" },
      ...[0, 120, 240].map((a): Part => ({ shape: "box", size: [0.03,0.12,0.03], pos: [0.55 + 0.2 * Math.sin((a * Math.PI) / 180),1.78,-0.56 + 0.2 * Math.cos((a * Math.PI) / 180)], color: "steel", fine: true })),
      // cheminée à bagues
      { shape: "lathe", sides: 10, pos: [0.03,0,-0.75], color: "steel", profile: [[0.13,0.25],[0.13,0.36],[0.1,0.42],[0.1,2.24],[0.12,2.26],[0.12,2.35],[0.08,2.35],[0.08,2.22]] },
      { shape: "cylinder", sides: 10, radius: 0.115, height: 0.2, pos: [0.03,1.9,-0.75], color: "faction" },
      ...[1.6, 2.1].map((y): Part => ({ shape: "cylinder", sides: 10, radius: 0.115, height: 0.05, pos: [0.03,y,-0.75], color: "glow" })),
      { shape: "cylinder", sides: 8, radius: 0.08, height: 0.02, pos: [0.03,2.3,-0.75], color: "black" },
      // câbles des turbines vers la bobine
      { shape: "tube", radius: 0.05, path: [[0.6,1.0,-0.2],[0.6,1.2,-0.3],[0.55,1.25,-0.3]], bend: 0.08, color: "rubber", fine: true },
      { shape: "tube", radius: 0.045, path: [[-0.3,1.0,-0.2],[-0.3,1.1,-0.4],[-0.36,1.1,-0.5]], bend: 0.08, color: "rubber", fine: true },
    ],
  },
  // main_generator : générateur de départ (3 × 3) — halle à murs d'équipe où repose une grande turbine tournée,
  // cuve d'hydrocarbure à jauge ambre, deux cheminées évasées, haut mât émetteur à anneaux lumineux (sa grande
  // zone d'alimentation) haubané, transformateur ; pièces fines : haubans, rayons, cerclages, échelle, garde-corps
  main_generator: {
    parts: [
      ...socle(3),
      ...filets(3),
      // halle : plancher, murs sombres à chaperon d'équipe, filet
      { shape: "box", size: [1.3,0.12,2.2], pos: [-0.65,0.31,0.1], color: "concrete" },
      { shape: "bevel", size: [0.22,0.9,2.2], pos: [-1.19,0.7,0.1], bevel: 0.04, color: "dark" },
      { shape: "bevel", size: [0.22,0.9,2.2], pos: [-0.11,0.7,0.1], bevel: 0.04, color: "dark" },
      { shape: "extrude", profile: [[-0.14,0],[0.14,0],[0.14,0.06],[0.02,0.16],[-0.14,0.16]], depth: 2.2, bevel: 0.015, pos: [-1.19,1.15,0.1], color: "faction" },
      { shape: "extrude", profile: [[-0.14,0],[0.14,0],[0.14,0.16],[-0.02,0.16],[-0.14,0.06]], depth: 2.2, bevel: 0.015, pos: [-0.11,1.15,0.1], color: "faction" },
      { shape: "box", size: [0.03,0.06,1.8], pos: [-1.31,0.6,0.1], color: "glow" },
      ...[-0.6, 0.1, 0.8].map((z): Part => ({ shape: "box", size: [0.04,0.8,0.08], pos: [-1.31,0.7,z], color: "light", fine: true })),
      // turbine : carter tourné, cerclages, prise d'air à hélice
      { shape: "lathe", sides: 16, pos: [-0.65,1.0,0.1], rot: [90,0,0], color: "light", profile: [[0,-1.0],[0.22,-0.98],[0.36,-0.88],[0.44,-0.74],[0.46,-0.6],[0.46,0.9],[0.5,0.95],[0.5,1.12],[0.46,1.18],[0.42,1.18],[0.42,1.08],[0,1.08]] },
      ...[-0.3, 0.3].map((z): Part => ({ shape: "cylinder", sides: 16, radius: 0.47, height: 0.08, pos: [-0.65,1.0,z], rot: [90,0,0], color: "dark" })),
      ...[-0.6, 0.0, 0.6].map((z): Part => ({ shape: "torus", radius: 0.46, tube: 0.02, sides: 16, pos: [-0.65,1.0,z], rot: [90,0,0], color: "steel", fine: true })),
      { shape: "box", size: [0.04,0.03,1.3], pos: [-0.65,1.465,0.0], color: "glow" },
      { shape: "cylinder", sides: 16, radius: 0.42, height: 0.02, pos: [-0.65,1.0,1.19], rot: [90,0,0], color: "black" },
      ...[10, 55, 100, 145].map((a): Part => ({ shape: "box", size: [0.76,0.08,0.015], pos: [-0.65,1.0,1.23], rot: [0,0,a], color: "steel" })),
      { shape: "cone", sides: 10, radius: 0.1, height: 0.14, pos: [-0.65,1.0,1.27], rot: [90,0,0], color: "steel" },
      { shape: "box", size: [0.05,0.05,0.03], pos: [-0.65,1.0,1.345], color: "amber" },
      // cuve d'hydrocarbure à l'arrière droite : bandeau d'équipe, jauge ambre, échelle, rambarde
      { use: "cuve", pos: [0.85,0.25,-0.8], scale: [0.84,1.15,0.84] },
      { shape: "cylinder", sides: 16, radius: 0.43, height: 0.14, pos: [0.85,0.95,-0.8], color: "faction" },
      { shape: "cylinder", sides: 16, radius: 0.45, height: 0.08, bevel: 0.02, pos: [0.85,0.33,-0.8], color: "dark" },
      { shape: "box", size: [0.06,0.5,0.03], pos: [0.85,0.62,-0.37], color: "amber" },
      { shape: "box", size: [0.1,0.56,0.02], pos: [0.85,0.62,-0.38], color: "dark" },
      { use: "echelle", pos: [1.27,0.33,-0.8], rot: [0,90,0], scale: [1,0.95,1] },
      { shape: "cylinder", sides: 8, radius: 0.1, height: 0.06, pos: [0.85,1.41,-0.8], color: "steel" },
      // deux cheminées évasées à bague lumineuse
      { shape: "lathe", sides: 12, pos: [-1.1,0,-1.22], color: "steel", profile: [[0.17,0.25],[0.17,0.36],[0.13,0.42],[0.12,2.23],[0.16,2.3],[0.16,2.42],[0.11,2.42],[0.11,2.3]] },
      { shape: "cylinder", sides: 12, radius: 0.125, height: 0.06, pos: [-1.1,1.95,-1.22], color: "glow" },
      { shape: "cylinder", sides: 12, radius: 0.13, height: 0.16, pos: [-1.1,1.3,-1.22], color: "faction" },
      { shape: "lathe", sides: 12, pos: [-0.72,0,-1.22], color: "steel", profile: [[0.15,0.25],[0.15,0.36],[0.11,0.42],[0.1,1.93],[0.14,2.0],[0.14,2.12],[0.09,2.12],[0.09,2.0]] },
      { shape: "cylinder", sides: 12, radius: 0.105, height: 0.06, pos: [-0.72,1.7,-1.22], color: "glow" },
      { shape: "cylinder", sides: 12, radius: 0.11, height: 0.14, pos: [-0.72,1.1,-1.22], color: "faction" },
      ...[[-1.1,2.38],[-0.72,2.08]].map(([x, y]): Part => ({ shape: "cylinder", sides: 6, radius: 0.1, height: 0.02, pos: [x,y,-1.22], color: "black" })),
      // mât émetteur : embase claire, fût effilé, anneaux lumineux à rayons, haubans, coiffe d'équipe et feu
      { shape: "bevel", size: [0.7,0.4,0.7], pos: [0.75,0.45,0.55], bevel: 0.06, color: "light" },
      { shape: "box", size: [0.5,0.06,0.5], pos: [0.75,0.67,0.55], color: "faction" },
      { shape: "lathe", sides: 10, pos: [0.75,0.65,0.55], color: "steel", profile: [[0.15,0],[0.15,0.1],[0.11,0.16],[0.06,2.15],[0,2.15]] },
      ...[[1.3,0.34],[1.85,0.26],[2.35,0.18]].map(([y, r]): Part => ({ shape: "torus", radius: r, tube: 0.03, sides: 12, pos: [0.75,y,0.55], color: "glow" })),
      ...[[1.3,0.34],[1.85,0.26],[2.35,0.18]].flatMap(([y, r]): Part[] => [0, 90].map((a): Part => ({ shape: "box", size: [r * 2,0.02,0.02], pos: [0.75,y,0.55], rot: [0,a + 45,0], color: "steel", fine: true }))),
      ...[[0.42,0.22],[1.08,0.22],[0.42,0.88],[1.08,0.88]].map(([x, z]): Part => ({ shape: "tube", radius: 0.008, sides: 4, path: [[x,0.66,z],[0.75,2.1,0.55]], color: "dark", fine: true })),
      { shape: "cone", sides: 8, radius: 0.14, height: 0.3, pos: [0.75,2.95,0.55], color: "faction" },
      { shape: "sphere", radius: 0.08, pos: [0.75,3.14,0.55], color: "amber" },
      // transformateur à l'avant droit, ailettes, écran
      { shape: "bevel", size: [0.9,0.34,0.36], pos: [0.65,0.42,1.2], bevel: 0.04, color: "light" },
      { shape: "box", size: [0.8,0.03,0.28], pos: [0.65,0.6,1.2], color: "faction" },
      ...[0.35, 0.5, 0.65, 0.8, 0.95].map((x): Part => ({ shape: "box", size: [0.03,0.26,0.38], pos: [x,0.42,1.2], color: "metal", fine: true })),
      { shape: "box", size: [0.3,0.1,0.01], pos: [0.45,0.45,1.385], color: "glow" },
      // conduite cuve → halle (cuivre, brides, vanne), câble halle → mât
      { shape: "tube", radius: 0.06, path: [[0.43,0.5,-0.8],[0.15,0.5,-0.8],[0.0,0.5,-0.62]], bend: 0.12, color: "copper" },
      { shape: "torus", radius: 0.075, tube: 0.018, sides: 10, pos: [0.3,0.5,-0.8], rot: [0,0,90], color: "steel", fine: true },
      { use: "vanne", pos: [0.2,0.55,-0.8] },
      { shape: "tube", radius: 0.05, path: [[0.0,0.9,0.4],[0.2,0.75,0.5],[0.4,0.6,0.55]], bend: 0.1, color: "rubber" },
      { shape: "box", size: [0.1,0.06,0.03], pos: [0.3,0.4,1.49], color: "amber", mirror: true },
    ],
  },
  // pylon : pied de béton et embase d'équipe, mât effilé haubané de jambes de force, traverse à isolateurs à
  // disques lumineux, feu ambre (pièces fines : jambes de force, disques, boulons)
  pylon: {
    parts: [
      { shape: "box", size: [0.6,0.1,0.6], pos: [0,0.05,0], color: "concrete" },
      { shape: "cylinder", sides: 6, radius: 0.22, radiusTop: 0.15, height: 0.26, pos: [0,0.23,0], rot: [0,30,0], color: "faction" },
      { shape: "cylinder", sides: 6, radius: 0.1, radiusTop: 0.045, height: 1.55, pos: [0,1.13,0], color: "steel" },
      { shape: "box", size: [0.74,0.07,0.08], pos: [0,1.4,0], color: "light" },
      { shape: "box", size: [0.42,0.06,0.06], pos: [0,1.12,0], color: "metal" },
      { shape: "cylinder", sides: 6, radius: 0.035, height: 0.16, pos: [0.32,1.29,0], color: "glow", mirror: true },
      ...[1.33, 1.28, 1.23].map((y): Part => ({ shape: "cylinder", sides: 6, radius: 0.065, height: 0.02, pos: [0.32,y,0], color: "light", mirror: true, fine: true })),
      { shape: "box", size: [0.03,0.6,0.03], pos: [0.17,0.6,0], rot: [0,0,14], color: "metal", fine: true },
      { shape: "box", size: [0.03,0.6,0.03], pos: [-0.17,0.6,0], rot: [0,0,-14], color: "metal", fine: true },
      { shape: "box", size: [0.03,0.6,0.03], pos: [0,0.6,0.17], rot: [-14,0,0], color: "metal", fine: true },
      { shape: "box", size: [0.03,0.6,0.03], pos: [0,0.6,-0.17], rot: [14,0,0], color: "metal", fine: true },
      { shape: "cone", sides: 5, radius: 0.08, height: 0.22, pos: [0,1.85,0], color: "faction" },
      { shape: "sphere", radius: 0.07, pos: [0,1.98,0], color: "amber" },
    ],
  },
  // hydro_plant : deux tours de refroidissement hyperboliques fumantes (bandeau d'équipe, anneau lumineux),
  // cheminée à bagues, trois conduites de cuivre et d'acier à brides sur berceaux de béton, station de pompage,
  // petit dôme ; pièces fines : brides, vannes, échelles, rambardes
  hydro_plant: {
    parts: [
      ...socle(3),
      ...filets(3),
      // dalles de béton sous les tours
      { shape: "cylinder", sides: 16, radius: 0.62, height: 0.06, pos: [-0.3,0.28,-0.6], color: "concrete" },
      { shape: "cylinder", sides: 16, radius: 0.66, height: 0.06, pos: [0.72,0.28,-0.3], color: "concrete" },
      // tour de refroidissement arrière gauche
      { shape: "lathe", sides: 16, pos: [-0.3,0,-0.6], color: "light", profile: [[0.55,0.3],[0.5,0.55],[0.45,0.85],[0.42,1.12],[0.43,1.38],[0.46,1.6],[0.48,1.68],[0.44,1.68],[0.42,1.52]] },
      ...[0, 60, 120, 180, 240, 300].map((a): Part => ({ shape: "box", size: [0.06,0.12,0.06], pos: [-0.3 + 0.55 * Math.sin((a * Math.PI) / 180),0.33,-0.6 + 0.55 * Math.cos((a * Math.PI) / 180)], rot: [0,a,0], color: "concrete", fine: true })),
      { shape: "cylinder", sides: 12, radius: 0.42, height: 0.02, pos: [-0.3,1.52,-0.6], color: "black" },
      { shape: "cylinder", sides: 16, radius: 0.435, height: 0.16, pos: [-0.3,1.1,-0.6], color: "faction" },
      { shape: "torus", radius: 0.46, tube: 0.025, sides: 16, pos: [-0.3,0.9,-0.6], color: "glow" },
      { shape: "sphere", radius: 0.32, detail: 1, pos: [-0.3,1.76,-0.6], scale: [1,0.45,1], color: "light" },
      { shape: "sphere", radius: 0.2, detail: 1, pos: [-0.22,1.84,-0.66], scale: [1,0.5,1], color: "light" },
      { use: "echelle", pos: [-0.3,0.3,-0.06], scale: [0.7,1.3,1] },
      // tour de refroidissement droite
      { shape: "lathe", sides: 16, pos: [0.72,0,-0.3], color: "light", profile: [[0.6,0.28],[0.54,0.5],[0.48,0.78],[0.46,1.02],[0.47,1.25],[0.51,1.46],[0.52,1.55],[0.48,1.55],[0.46,1.4]] },
      ...[0, 60, 120, 180, 240, 300].map((a): Part => ({ shape: "box", size: [0.06,0.12,0.06], pos: [0.72 + 0.6 * Math.sin((a * Math.PI) / 180),0.33,-0.3 + 0.6 * Math.cos((a * Math.PI) / 180)], rot: [0,a,0], color: "concrete", fine: true })),
      { shape: "cylinder", sides: 12, radius: 0.46, height: 0.02, pos: [0.72,1.4,-0.3], color: "black" },
      { shape: "cylinder", sides: 16, radius: 0.475, height: 0.16, pos: [0.72,1.02,-0.3], color: "faction" },
      { shape: "torus", radius: 0.5, tube: 0.025, sides: 16, pos: [0.72,0.82,-0.3], color: "glow" },
      { shape: "sphere", radius: 0.36, detail: 1, pos: [0.72,1.63,-0.3], scale: [1,0.45,1], color: "light" },
      { shape: "sphere", radius: 0.22, detail: 1, pos: [0.82,1.72,-0.36], scale: [1,0.5,1], color: "light" },
      { shape: "box", size: [0.08,0.06,0.03], pos: [0.72,1.02,0.18], color: "amber" },
      // cheminée à bagues
      { shape: "lathe", sides: 12, pos: [-1.08,0,-1.0], color: "steel", profile: [[0.22,0.25],[0.22,0.34],[0.18,0.4],[0.17,1.5],[0.21,1.54],[0.21,1.63],[0.15,1.63],[0.15,1.5]] },
      { shape: "cylinder", sides: 12, radius: 0.185, height: 0.06, pos: [-1.08,1.3,-1.0], color: "glow" },
      { shape: "cylinder", sides: 12, radius: 0.185, height: 0.14, pos: [-1.08,1.0,-1.0], color: "faction" },
      { shape: "cylinder", sides: 8, radius: 0.15, height: 0.02, pos: [-1.08,1.6,-1.0], color: "black" },
      // station de pompage à l'avant gauche (toit d'équipe, grille)
      { shape: "bevel", size: [0.5,0.5,1.0], pos: [-1.18,0.5,0.8], bevel: 0.04, color: "dark" },
      { shape: "bevel", size: [0.54,0.08,1.04], pos: [-1.18,0.78,0.8], bevel: 0.025, color: "faction" },
      ...[0.5, 0.8, 1.1].map((z): Part => ({ shape: "box", size: [0.03,0.24,0.18], pos: [-0.92,0.5,z], color: "black", fine: true })),
      { shape: "box", size: [0.03,0.04,0.8], pos: [-0.925,0.68,0.8], color: "glow" },
      // trois conduites à brides sur berceaux de béton
      ...[[0.45,"copper"],[0.8,"steel"],[1.15,"copper"]].map(([z, c]): Part => ({ shape: "tube", radius: 0.13, sides: 12, path: [[-0.93,0.48,z as number],[0.2,0.48,z as number]], color: c as Part["color"] })),
      ...[0.45, 0.8, 1.15].flatMap((z): Part[] => [-0.65, -0.05].map((x): Part => ({ shape: "torus", radius: 0.14, tube: 0.025, sides: 12, pos: [x,0.48,z], rot: [0,0,90], color: "dark", fine: true }))),
      ...[-0.75, -0.15].map((x): Part => ({ shape: "extrude", profile: [[-0.48,0],[0.48,0],[0.48,0.16],[0.42,0.16],[0.35,0.1],[0.28,0.16],[0.07,0.16],[0,0.1],[-0.07,0.16],[-0.28,0.16],[-0.35,0.1],[-0.42,0.16],[-0.48,0.16]], depth: 0.1, pos: [x,0.25,0.8], rot: [0,90,0], color: "concrete" })),
      { shape: "cylinder", sides: 12, radius: 0.15, height: 0.05, pos: [0.22,0.48,0.8], rot: [0,0,90], color: "glow" },
      { use: "vanne", pos: [-0.35,0.6,0.45] },
      { use: "vanne", pos: [-0.35,0.6,1.15] },
      // petit dôme avant droit sur embase, anneau lumineux
      { shape: "cylinder", sides: 16, radius: 0.34, height: 0.14, bevel: 0.03, pos: [0.85,0.32,0.8], color: "dark" },
      { shape: "lathe", sides: 16, pos: [0.85,0.38,0.8], color: "light", profile: [[0,0],[0.32,0],[0.29,0.12],[0.22,0.22],[0.12,0.28],[0,0.3]] },
      { shape: "torus", radius: 0.32, tube: 0.02, sides: 16, pos: [0.85,0.4,0.8], color: "glow" },
      { shape: "cylinder", sides: 10, radius: 0.08, height: 0.05, pos: [0.85,0.69,0.8], color: "faction" },
      { shape: "box", size: [0.08,0.06,0.03], pos: [0.85,0.36,1.15], color: "amber" },
      { use: "garde_corps", pos: [0.85,0.25,1.42], scale: [1.0,0.8,1] },
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
  // air_factory : piste de béton balisée et déflecteur, avion de chasse tourné (ailes d'équipe, verrière), hangar
  // à voûte d'équipe sur arcs clairs (même famille que land_factory), réservoirs de kérosène, tour de contrôle à
  // fût tourné, vigie vitrée et parabole ; pièces fines : marquages, balises, train, rambardes, antenne
  air_factory: {
    parts: [
      ...socle(5),
      ...filets(5),
      // piste : dalle de béton, bande sombre, balisage lumineux, marquages
      { shape: "bevel", size: [2.3,0.08,4.7], pos: [-1.0,0.29,0], bevel: 0.03, color: "concrete" },
      { shape: "box", size: [1.8,0.02,4.5], pos: [-1.0,0.34,0], color: "dark" },
      { shape: "box", size: [0.04,0.03,4.3], pos: [-2.0,0.35,0], color: "glow" },
      { shape: "box", size: [0.04,0.03,4.3], pos: [0.0,0.35,0], color: "glow" },
      { shape: "box", size: [0.12,0.02,0.4], pos: [-1.0,0.355,2.0], color: "light" },
      { shape: "box", size: [0.12,0.02,0.4], pos: [-1.0,0.355,-1.3], color: "light" },
      ...[-0.8, -0.3, 1.2, 1.55].map((z): Part => ({ shape: "box", size: [0.08,0.01,0.25], pos: [-1.0,0.355,z], color: "light", fine: true })),
      ...[-1.55, -1.4, -0.6, -0.45].map((x): Part => ({ shape: "box", size: [0.08,0.01,0.3], pos: [x,0.355,2.1], color: "light", fine: true })),
      ...[-1.6, -0.6, 0.4, 1.4].map((z): Part => ({ shape: "box", size: [0.05,0.05,0.05], pos: [-2.08,0.37,z], color: "amber", fine: true })),
      // déflecteur de souffle incliné, étais
      { shape: "box", size: [1.8,0.55,0.06], pos: [-1.0,0.55,-2.05], rot: [-35,0,0], color: "steel" },
      { shape: "box", size: [1.7,0.08,0.02], pos: [-1.0,0.7,-2.15], rot: [-35,0,0], color: "hazard" },
      ...[-1.7, -1.0, -0.3].map((x): Part => ({ shape: "box", size: [0.05,0.4,0.05], pos: [x,0.5,-2.3], rot: [30,0,0], color: "dark", fine: true })),
      { shape: "box", size: [0.1,0.06,0.03], pos: [-1.6,0.37,-1.79], color: "amber" },
      // avion : fuselage tourné, verrière, ailes et empennage d'équipe, dérives claires, tuyère
      { shape: "lathe", sides: 12, pos: [-1.0,0.62,-0.62], rot: [90,0,0], color: "light", profile: [[0,0],[0.12,0],[0.17,0.2],[0.17,1.3],[0.13,1.68],[0.06,1.92],[0,2.02]] },
      { shape: "lathe", sides: 8, pos: [-1.0,0.74,0.56], rot: [90,0,0], scale: [0.75,1,1], color: "glass", profile: [[0,0],[0.1,0.02],[0.14,0.12],[0.14,0.34],[0.1,0.48],[0,0.54]] },
      { shape: "extrude", profile: [[0.12,0.3],[0.95,-0.12],[0.95,-0.3],[0.12,-0.3]], depth: 0.05, bevel: 0.01, pos: [-1.0,0.58,0.0], rot: [90,0,0], color: "faction" },
      { shape: "extrude", profile: [[-0.12,0.3],[-0.95,-0.12],[-0.95,-0.3],[-0.12,-0.3]], depth: 0.05, bevel: 0.01, pos: [-1.0,0.58,0.0], rot: [90,0,0], color: "faction" },
      { shape: "box", size: [0.15,0.03,0.04], pos: [-0.12,0.585,-0.21], rot: [0,90,0], color: "glow" },
      { shape: "box", size: [0.15,0.03,0.04], pos: [-1.88,0.585,-0.21], rot: [0,90,0], color: "glow" },
      { shape: "extrude", profile: [[-0.45,0.0],[0.45,0.0],[0.45,-0.12],[0.1,-0.22],[-0.1,-0.22],[-0.45,-0.12]], depth: 0.04, pos: [-1.0,0.64,-0.4], rot: [90,0,0], color: "faction" },
      ...[-1, 1].map((s): Part => ({ shape: "box", size: [0.04,0.3,0.28], pos: [-1.0 + s * 0.1,0.85,-0.52], rot: [0,0,-s * 15], color: "light" })),
      { shape: "cylinder", sides: 10, radius: 0.12, height: 0.08, pos: [-1.0,0.62,-0.64], rot: [90,0,0], color: "steel" },
      { shape: "cylinder", sides: 10, radius: 0.09, height: 0.02, pos: [-1.0,0.62,-0.69], rot: [90,0,0], color: "glow" },
      ...[[-1.0,0.95],[-0.8,0.0],[-1.2,0.0]].map(([x, z]): Part => ({ shape: "box", size: [0.03,0.18,0.03], pos: [x,0.44,z], color: "dark", fine: true })),
      ...[[-1.0,0.95],[-0.8,0.0],[-1.2,0.0]].map(([x, z]): Part => ({ shape: "cylinder", sides: 8, radius: 0.04, height: 0.03, pos: [x,0.38,z], rot: [0,0,90], color: "rubber", fine: true })),
      // hangar : murs sombres, voûte d'équipe sur arcs clairs, verrière, portail à rideau
      { shape: "bevel", size: [2.0,0.62,2.1], pos: [1.3,0.56,0.95], color: "dark" },
      { shape: "extrude", profile: arc(0.95, 0.46, 0, 9), depth: 1.9, pos: [1.3,0.87,0.9], color: "faction" },
      ...[0.05, 0.7, 1.35].map((z): Part => ({ shape: "extrude", profile: arc(1.0, 0.5, 0.09, 7), depth: 0.1, pos: [1.3,0.87,z], color: "light" })),
      { shape: "box", size: [0.3,0.05,1.8], pos: [1.3,1.33,0.9], color: "glass" },
      { shape: "box", size: [0.03,0.03,1.7], pos: [1.3,1.36,0.9], color: "glow" },
      ...[0.4, 0.75, 1.1, 1.45].map((z): Part => ({ shape: "box", size: [0.08,0.5,0.1], pos: [2.31,0.55,z], color: "light", fine: true })),
      { shape: "box", size: [0.03,0.05,1.6], pos: [2.31,0.85,0.95], color: "glow" },
      { shape: "bevel", size: [0.36,1.1,0.4], pos: [2.06,0.8,1.8], bevel: 0.05, color: "light" },
      { shape: "bevel", size: [0.36,1.1,0.4], pos: [0.54,0.8,1.8], bevel: 0.05, color: "light" },
      { shape: "bevel", size: [1.9,0.22,0.4], pos: [1.3,1.38,1.8], bevel: 0.04, color: "light" },
      { shape: "box", size: [1.6,0.08,0.06], pos: [1.3,1.4,2.01], color: "faction" },
      { shape: "box", size: [1.14,0.95,0.06], pos: [1.3,0.74,1.9], color: "black" },
      ...[0.45, 0.65, 0.85, 1.05].map((y): Part => ({ shape: "box", size: [1.1,0.035,0.04], pos: [1.3,y,1.94], color: "metal", fine: true })),
      { shape: "box", size: [1.1,0.04,0.03], pos: [1.3,1.21,1.97], color: "glow" },
      { shape: "cylinder", sides: 10, radius: 0.06, height: 0.07, pos: [2.06,1.53,1.8], color: "amber" },
      { shape: "box", size: [0.08,0.06,0.03], pos: [2.06,0.6,2.01], color: "amber" },
      // réservoirs de kérosène couchés entre hangar et tour
      ...[-0.24, -0.5].map((z): Part => ({ shape: "lathe", sides: 12, pos: [0.5,0.48,z], rot: [0,0,-90], color: "light", profile: [[0,0],[0.1,0],[0.14,0.08],[0.14,0.84],[0.1,0.92],[0,0.92]] })),
      ...[-0.24, -0.5].map((z): Part => ({ shape: "cylinder", sides: 12, radius: 0.145, height: 0.1, pos: [0.95,0.48,z], rot: [0,0,90], color: "faction" })),
      ...[0.65, 1.25].map((x): Part => ({ shape: "extrude", profile: [[-0.28,0],[0.28,0],[0.28,0.12],[0.2,0.12],[0.15,0.09],[0.1,0.12],[-0.1,0.12],[-0.15,0.09],[-0.2,0.12],[-0.28,0.12]], depth: 0.08, pos: [x,0.25,-0.37], rot: [0,90,0], color: "concrete", fine: true })),
      { shape: "tube", radius: 0.03, path: [[1.42,0.48,-0.37],[1.6,0.48,-0.37],[1.6,0.48,-0.1]], bend: 0.06, color: "copper", fine: true },
      // tour de contrôle : embase, fût tourné à anneaux lumineux, ascenseur vitré, vigie, toit d'équipe
      { shape: "bevel", size: [1.5,0.4,1.5], pos: [1.4,0.45,-1.4], bevel: 0.06, color: "light" },
      { shape: "box", size: [1.2,0.05,1.2], pos: [1.4,0.67,-1.4], color: "concrete" },
      { shape: "lathe", sides: 12, pos: [1.4,0,-1.4], color: "light", profile: [[0,0.65],[0.55,0.65],[0.55,0.72],[0.48,0.8],[0.44,1.1],[0.42,2.42],[0,2.42]] },
      ...[1.1, 1.7].map((y): Part => ({ shape: "torus", radius: 0.44, tube: 0.03, sides: 12, pos: [1.4,y,-1.4], color: "glow" })),
      { shape: "box", size: [0.2,1.6,0.06], pos: [1.4,1.6,-0.98], color: "dark" },
      { shape: "box", size: [0.12,1.5,0.02], pos: [1.4,1.6,-0.945], color: "glass" },
      { shape: "lathe", sides: 12, pos: [1.4,0,-1.4], color: "dark", profile: [[0,2.38],[0.5,2.38],[0.72,2.52],[0.72,2.58],[0,2.58]] },
      { shape: "cylinder", sides: 12, radius: 0.7, radiusTop: 0.64, height: 0.2, pos: [1.4,2.68,-1.4], color: "glass" },
      ...[0, 45, 90, 135].map((a): Part => ({ shape: "box", size: [1.36,0.2,0.025], pos: [1.4,2.68,-1.4], rot: [0,a + 22.5,0], color: "dark", fine: true })),
      { shape: "cylinder", sides: 12, radius: 0.68, height: 0.1, bevel: 0.03, pos: [1.4,2.83,-1.4], color: "faction" },
      { shape: "cylinder", sides: 10, radius: 0.24, height: 0.06, pos: [1.4,2.9,-1.4], color: "light" },
      // parabole et antenne
      { shape: "box", size: [0.05,0.3,0.05], pos: [1.25,3.02,-1.45], color: "dark" },
      { shape: "lathe", sides: 12, pos: [1.25,3.12,-1.45], rot: [30,0,0], color: "light", profile: [[0,0],[0.15,0.02],[0.3,0.09],[0.33,0.12],[0.29,0.11],[0.15,0.05],[0,0.03]] },
      { shape: "tube", radius: 0.012, sides: 4, path: [[1.75,2.9,-1.6],[1.75,3.47,-1.6]], color: "dark", fine: true },
      { shape: "box", size: [0.06,0.06,0.06], pos: [1.75,3.5,-1.6], color: "amber" },
    ],
  },
  // naval_factory : cale sèche en U sur l'eau, coque profilée en chantier (membrures nues à l'étrave, pont
  // partiel, superstructure), quais à couronnement d'équipe garnis de bittes et de défenses, deux grues à flèche
  // en treillis, poste de commande à l'arrière ; pièces fines : membrures, bittes, défenses, treillis, conteneurs
  naval_factory: {
    parts: [
      ...socle(5),
      ...filets(5),
      // bassin et coque en chantier
      { shape: "box", size: [2.9,0.04,3.9], pos: [0,0.27,0.45], color: "glass" },
      ...[-0.3, 0.6, 1.5].map((z): Part => ({ shape: "box", size: [0.5,0.12,0.18], pos: [0,0.33,z], color: "concrete" })),
      { shape: "extrude", profile: [[-0.4,-0.45],[0.4,-0.45],[0.42,0.9],[0.28,1.4],[0,1.62],[-0.28,1.4],[-0.42,0.9]], depth: 0.32, bevel: 0.03, pos: [0,0.54,0], rot: [90,0,0], color: "metal" },
      { shape: "extrude", profile: [[-0.38,-0.42],[0.38,-0.42],[0.4,0.6],[-0.4,0.6]], depth: 0.04, pos: [0,0.71,0], rot: [90,0,0], color: "light" },
      { shape: "box", size: [0.86,0.05,1.2], pos: [0,0.45,0.1], color: "faction" },
      ...[0.75, 0.95, 1.15, 1.35].map((z, i): Part => ({ shape: "box", size: [0.8 - i * 0.12,0.16,0.035], pos: [0,0.76,z], color: "steel", fine: true })),
      { shape: "box", size: [0.04,0.06,0.9], pos: [0,0.82,1.1], color: "steel", fine: true },
      { shape: "bevel", size: [0.44,0.3,0.55], pos: [0,0.88,0.05], bevel: 0.04, color: "light" },
      { shape: "box", size: [0.36,0.06,0.02], pos: [0,0.94,0.33], color: "glass" },
      { shape: "box", size: [0.3,0.08,0.35], pos: [0,1.07,0.0], color: "faction" },
      { shape: "sphere", radius: 0.04, pos: [0.18,0.82,1.02], color: "amber", fine: true },
      // quais latéraux : couronnement d'équipe, filets, défenses de caoutchouc, bittes
      { shape: "bevel", size: [0.95,0.85,4.8], pos: [1.95,0.67,0], color: "dark", mirror: true },
      { shape: "bevel", size: [0.85,0.12,4.6], pos: [1.95,1.14,0], bevel: 0.04, color: "faction", mirror: true },
      { shape: "box", size: [0.03,0.06,4.0], pos: [1.46,0.9,0.2], color: "glow", mirror: true },
      { shape: "box", size: [0.03,0.06,0.1], pos: [1.46,0.6,1.2], color: "amber", mirror: true },
      ...[-0.8, 0.2, 1.2, 2.0].map((z): Part => ({ shape: "cylinder", sides: 8, radius: 0.07, height: 0.3, pos: [1.47,0.55,z], rot: [0,0,0], color: "rubber", mirror: true, fine: true })),
      ...[-0.3, 0.7, 1.7].map((z): Part => ({ shape: "lathe", sides: 8, pos: [1.62,1.2,z], color: "steel", mirror: true, fine: true, profile: [[0,0],[0.06,0],[0.045,0.04],[0.045,0.1],[0.065,0.12],[0,0.13]] })),
      { shape: "box", size: [0.03,0.02,4.4], pos: [2.15,1.21,0], color: "steel", mirror: true },
      { shape: "box", size: [0.9,0.3,0.7], pos: [1.95,1.3,1.9], color: "light", mirror: true },
      { shape: "box", size: [0.5,0.08,0.02], pos: [1.95,1.33,2.26], color: "glow", mirror: true },
      { shape: "box", size: [0.95,0.25,0.04], pos: [1.95,0.6,2.41], color: "hazard", mirror: true },
      ...[0.6, 1.0].map((z): Part => ({ shape: "bevel", size: [0.32,0.22,0.5], pos: [2.05,1.31,z], bevel: 0.02, color: z > 0.8 ? "faction" : "metal", mirror: true, fine: true })),
      // fond du bassin, poste de commande
      { shape: "bevel", size: [3.0,0.85,0.95], pos: [0,0.67,-1.95], color: "dark" },
      { shape: "bevel", size: [2.8,0.12,0.85], pos: [0,1.14,-1.95], bevel: 0.04, color: "light" },
      { shape: "bevel", size: [1.2,0.5,0.6], pos: [0,1.45,-2.0], bevel: 0.05, color: "metal" },
      { shape: "box", size: [0.8,0.12,0.03], pos: [0,1.5,-1.69], color: "glow" },
      { shape: "box", size: [1.1,0.06,0.5], pos: [0,1.72,-2.0], color: "faction" },
      { shape: "box", size: [2.6,0.04,0.03], pos: [0,1.0,-1.47], color: "glow" },
      { use: "garde_corps", pos: [0,1.2,-1.55], scale: [2.6,0.8,1] },
      { shape: "tube", radius: 0.012, sides: 4, path: [[0.45,1.75,-2.15],[0.45,2.2,-2.15]], color: "dark", fine: true },
      { shape: "sphere", radius: 0.04, pos: [0.45,2.22,-2.15], color: "amber" },
      // grues : fût clair, cabine vitrée, flèche en treillis, contrepoids, câble et moufle
      { shape: "bevel", size: [0.35,1.1,0.35], pos: [1.95,1.75,-0.8], color: "light", mirror: true },
      { shape: "cylinder", sides: 10, radius: 0.26, height: 0.08, pos: [1.95,2.24,-0.8], color: "steel", mirror: true },
      { shape: "box", size: [0.3,0.22,0.3], pos: [1.75,2.05,-0.58], color: "faction", mirror: true },
      { shape: "box", size: [0.26,0.1,0.02], pos: [1.75,2.08,-0.43], color: "glass", mirror: true },
      { shape: "box", size: [1.5,0.07,0.26], pos: [1.4,2.43,-0.8], color: "dark", mirror: true },
      { shape: "box", size: [1.5,0.07,0.26], pos: [1.4,2.27,-0.8], color: "dark", mirror: true },
      ...[0.85, 1.15, 1.45, 1.75].map((x): Part => ({ shape: "box", size: [0.03,0.2,0.03], pos: [x,2.35,-0.69], rot: [0,0,35], color: "steel", mirror: true, fine: true })),
      ...[0.85, 1.15, 1.45, 1.75].map((x): Part => ({ shape: "box", size: [0.03,0.2,0.03], pos: [x,2.35,-0.91], rot: [0,0,35], color: "steel", mirror: true, fine: true })),
      { shape: "box", size: [1.2,0.03,0.03], pos: [1.4,2.35,-0.66], color: "glow", mirror: true },
      { shape: "bevel", size: [0.4,0.3,0.4], pos: [2.15,2.35,-0.8], bevel: 0.04, color: "metal", mirror: true },
      { shape: "box", size: [0.03,0.6,0.03], pos: [0.8,1.95,-0.8], color: "dark", mirror: true },
      { shape: "box", size: [0.16,0.12,0.16], pos: [0.8,1.6,-0.8], color: "hazard", mirror: true },
      { shape: "torus", radius: 0.05, tube: 0.015, sides: 8, arc: 270, pos: [0.8,1.5,-0.8], rot: [90,0,0], color: "steel", mirror: true, fine: true },
      { shape: "box", size: [0.06,0.06,0.03], pos: [1.95,2.0,-0.62], color: "amber", mirror: true },
    ],
  },
  // gantry : portique géant sur quatre pieds blindés, longerons d'équipe à rail et caillebotis, traverses,
  // portique mobile (bras) à chariot, tambours, câbles et moufle, aire de montage de béton avec un châssis en
  // cours d'assemblage ; pièces fines : échelles, garde-corps, galets, boulons, gabarits
  gantry: {
    parts: [
      ...socle(7),
      ...filets(7),
      // aire de montage : dalle de béton, filets, bande de danger, gabarits et châssis en cours
      { shape: "bevel", size: [4.2,0.12,4.6], pos: [0,0.31,0.3], bevel: 0.05, color: "concrete" },
      { shape: "box", size: [3.6,0.03,0.06], pos: [0,0.38,2.3], color: "glow" },
      { shape: "box", size: [3.6,0.03,0.06], pos: [0,0.38,-1.7], color: "glow" },
      { shape: "box", size: [0.06,0.03,4.0], pos: [1.8,0.38,0.3], color: "glow", mirror: true },
      { shape: "box", size: [3.0,0.02,0.4], pos: [0,0.27,2.95], color: "hazard" },
      ...[[0.7,0.0],[0.7,1.0],[0.7,2.0]].map(([x, z]): Part => ({ shape: "box", size: [0.3,0.3,0.3], pos: [x,0.52,z], color: "hazard", mirror: true })),
      { shape: "extrude", profile: [[-1.15,0.0],[1.0,0.0],[1.25,0.25],[1.05,0.45],[-0.95,0.45],[-1.15,0.3]], depth: 1.3, bevel: 0.04, pos: [0,0.67,1.0], rot: [0,-90,0], color: "light" },
      { shape: "box", size: [1.0,0.05,1.2], pos: [0,1.14,0.9], color: "faction" },
      ...[0.2, 0.8, 1.4].map((z): Part => ({ shape: "box", size: [1.4,0.04,0.05], pos: [0,1.14,z], color: "steel", fine: true })),
      { shape: "box", size: [0.03,0.04,1.6], pos: [0.66,0.95,1.0], color: "glow", mirror: true },
      // pieds : semelles d'acier boulonnées, fûts sombres à jupe claire, filets, échelles
      { shape: "box", size: [0.95,0.4,1.1], pos: [3.0,0.45,2.7], color: "metal", mirror: true },
      { shape: "box", size: [0.95,0.4,1.1], pos: [3.0,0.45,-2.7], color: "metal", mirror: true },
      ...[2.7, -2.7].flatMap((z): Part[] => [[2.62,0.28],[3.38,0.28],[2.62,-0.28],[3.38,-0.28]].map(([x, dz]): Part => ({ shape: "cylinder", sides: 6, radius: 0.04, height: 0.06, pos: [x,0.67,z + dz], color: "steel", mirror: true, fine: true }))),
      { shape: "bevel", size: [0.7,3.1,0.7], pos: [3.0,1.8,2.7], color: "dark", mirror: true },
      { shape: "bevel", size: [0.7,3.1,0.7], pos: [3.0,1.8,-2.7], color: "dark", mirror: true },
      { shape: "box", size: [0.78,1.0,0.78], pos: [3.0,1.4,2.7], color: "light", mirror: true },
      { shape: "box", size: [0.78,1.0,0.78], pos: [3.0,1.4,-2.7], color: "light", mirror: true },
      { shape: "box", size: [0.8,0.08,0.8], pos: [3.0,0.95,2.7], color: "hazard", mirror: true },
      { shape: "box", size: [0.8,0.08,0.8], pos: [3.0,0.95,-2.7], color: "hazard", mirror: true },
      { shape: "box", size: [0.04,1.3,0.04], pos: [2.64,2.5,2.7], color: "glow", mirror: true },
      { shape: "box", size: [0.04,1.3,0.04], pos: [2.64,2.5,-2.7], color: "glow", mirror: true },
      { shape: "box", size: [0.1,0.08,0.03], pos: [3.0,0.5,3.26], color: "amber", mirror: true },
      { use: "echelle", pos: [3.0,1.9,3.06], scale: [1.2,1.4,1], mirror: true },
      { use: "echelle", pos: [3.0,1.9,-3.06], rot: [0,180,0], scale: [1.2,1.4,1], mirror: true },
      // machines latérales : armoires à grilles, toit d'équipe, tambours de câble en cuivre
      { shape: "bevel", size: [0.8,0.8,1.8], pos: [3.0,0.65,0], color: "light", mirror: true },
      { shape: "box", size: [0.6,0.12,1.4], pos: [3.0,1.1,0], color: "faction", mirror: true },
      { shape: "box", size: [0.03,0.05,1.4], pos: [3.41,0.8,0], color: "glow", mirror: true },
      ...[-0.5, -0.3, 0.3, 0.5].map((z): Part => ({ shape: "box", size: [0.03,0.4,0.12], pos: [2.59,0.6,z], color: "black", mirror: true, fine: true })),
      { shape: "cylinder", sides: 12, radius: 0.22, height: 0.5, pos: [3.0,1.4,0.0], rot: [90,0,0], color: "copper", mirror: true },
      ...[-0.27, 0.27].map((z): Part => ({ shape: "cylinder", sides: 12, radius: 0.27, height: 0.04, pos: [3.0,1.4,z], rot: [90,0,0], color: "steel", mirror: true, fine: true })),
      { shape: "box", size: [0.12,0.3,0.6], pos: [3.0,1.25,0], color: "dark", mirror: true },
      // longerons d'équipe à rail, caillebotis et garde-corps
      { shape: "bevel", size: [0.75,0.6,6.3], pos: [3.0,3.6,0], color: "faction", mirror: true },
      { shape: "box", size: [0.03,0.06,5.2], pos: [2.61,3.6,0], color: "glow", mirror: true },
      { shape: "box", size: [0.08,0.06,6.0], pos: [2.78,3.93,0], color: "steel", mirror: true },
      ...[-2.2, -1.1, 0, 1.1, 2.2].map((z): Part => ({ shape: "box", size: [0.4,0.02,0.9], pos: [3.12,3.91,z], color: "black", mirror: true, fine: true })),
      // traverses avant et arrière (poutres en I), filet, cabine de commande
      ...[2.7, -2.7].map((z): Part => ({ shape: "extrude", profile: [[-0.3,-0.25],[0.3,-0.25],[0.3,-0.17],[0.08,-0.17],[0.08,0.17],[0.3,0.17],[0.3,0.25],[-0.3,0.25],[-0.3,0.17],[-0.08,0.17],[-0.08,-0.17],[-0.3,-0.17]], depth: 5.3, bevel: 0.02, pos: [0,3.6,z], rot: [0,90,0], color: "metal" })),
      { shape: "box", size: [4.4,0.05,0.03], pos: [0,3.6,3.01], color: "glow" },
      { shape: "bevel", size: [0.8,0.55,0.7], pos: [-3.0,2.6,1.9], color: "light" },
      { shape: "box", size: [0.6,0.22,0.03], pos: [-3.0,2.65,2.26], color: "glass" },
      { shape: "box", size: [0.7,0.06,0.6], pos: [-3.0,2.9,1.9], color: "faction" },
      { shape: "box", size: [0.1,0.06,0.03], pos: [-2.75,2.45,2.26], color: "amber" },
      // portique mobile (bras) : poutre-caisson, galets, chariot, tambour, câbles et moufle
      { shape: "bevel", size: [5.0,0.4,0.6], pos: [0,3.05,-0.3], color: "light", pivot: "bras" },
      { shape: "box", size: [4.2,0.04,0.03], pos: [0,3.05,0.01], color: "glow", parent: "bras" },
      { shape: "box", size: [4.6,0.04,0.5], pos: [0,3.27,-0.3], color: "faction", parent: "bras" },
      ...[-0.4, -0.2].map((z): Part => ({ shape: "box", size: [4.6,0.03,0.04], pos: [0,3.3,z], color: "steel", parent: "bras", fine: true })),
      ...[-2.45, 2.45].map((x): Part => ({ shape: "box", size: [0.4,0.3,0.8], pos: [x,3.15,-0.3], color: "dark", parent: "bras" })),
      ...[-2.45, 2.45].flatMap((x): Part[] => [-0.55, -0.05].map((z): Part => ({ shape: "cylinder", sides: 10, radius: 0.1, height: 0.08, pos: [x,3.3,z], rot: [0,0,90], color: "steel", parent: "bras", fine: true }))),
      { shape: "bevel", size: [0.8,0.55,0.8], pos: [0,2.6,-0.3], color: "dark", parent: "bras" },
      { shape: "cylinder", sides: 12, radius: 0.18, height: 0.6, pos: [0,2.62,-0.3], rot: [0,0,90], color: "copper", parent: "bras" },
      { shape: "box", size: [0.1,0.06,0.03], pos: [0.2,2.65,0.11], color: "amber", mirror: true, parent: "bras" },
      { shape: "box", size: [0.05,1.0,0.05], pos: [0.12,1.85,-0.3], color: "metal", mirror: true, parent: "bras" },
      { shape: "box", size: [0.5,0.24,0.4], pos: [0,1.25,-0.3], color: "hazard", parent: "bras" },
      { shape: "cylinder", sides: 10, radius: 0.08, height: 0.42, pos: [0,1.28,-0.3], rot: [0,0,90], color: "steel", parent: "bras" },
      { shape: "torus", radius: 0.1, tube: 0.03, sides: 10, arc: 270, pos: [0,1.02,-0.3], rot: [90,0,0], color: "steel", parent: "bras" },
    ],
  },
  // radar : socle étagé à anneau lumineux, piédestal tourné, grande parabole tournante (pivot radar) à jante
  // d'équipe et source portée par trois bras, contrepoids ; armoire à grilles, radôme, antennes fouet (fines)
  radar: {
    parts: [
      ...socle(2),
      ...filets(2),
      { shape: "bevel", size: [1.3,0.32,1.3], pos: [0,0.4,0], bevel: 0.06, color: "light" },
      { shape: "bevel", size: [1.0,0.08,1.0], pos: [0,0.6,0], bevel: 0.03, color: "faction" },
      ...[[0.56,0.56],[0.56,-0.56]].map(([x, z]): Part => ({ shape: "cylinder", sides: 6, radius: 0.03, height: 0.04, pos: [x,0.57,z], color: "steel", mirror: true, fine: true })),
      { shape: "lathe", sides: 16, pos: [0,0.64,0], color: "steel", profile: [[0,0],[0.44,0],[0.44,0.06],[0.4,0.1],[0.36,0.26],[0.2,0.3],[0.15,0.34],[0.14,0.78],[0,0.78]] },
      { shape: "torus", radius: 0.42, tube: 0.025, sides: 16, pos: [0,0.72,0], color: "glow" },
      ...[0, 90, 180, 270].map((a): Part => ({ shape: "box", size: [0.08,0.12,0.03], pos: [0.36 * Math.sin((a * Math.PI) / 180),0.84,0.36 * Math.cos((a * Math.PI) / 180)], rot: [0,a,0], color: "dark", fine: true })),
      // parabole (tourne en continu) : coque tournée, jante d'équipe, bras de source, source lumineuse
      { shape: "lathe", sides: 16, pos: [0,1.62,0], rot: [40,0,0], color: "light", pivot: "radar", profile: [[0,-0.1],[0.2,-0.085],[0.42,-0.04],[0.62,0.04],[0.78,0.14],[0.79,0.16],[0.75,0.16],[0.6,0.08],[0.4,0.01],[0.2,-0.03],[0,-0.045]] },
      { shape: "torus", radius: 0.77, tube: 0.025, sides: 16, pos: [0,1.727,0.096], rot: [40,0,0], color: "faction", parent: "radar" },
      { shape: "bevel", size: [0.5,0.24,0.24], pos: [0,1.42,-0.05], bevel: 0.04, color: "dark", parent: "radar" },
      ...[-1, 1].map((s): Part => ({ shape: "box", size: [0.04,0.3,0.14], pos: [s * 0.2,1.45,0], color: "steel", parent: "radar" })),
      ...[[0,1.262,0.613],[-0.606,1.937,-0.191],[0.606,1.937,-0.191]].map((p): Part => ({ shape: "tube", radius: 0.014, sides: 4, path: [p as Vec3,[0,2.04,0.354]], color: "dark", parent: "radar", fine: true })),
      { shape: "cylinder", sides: 8, radius: 0.05, height: 0.2, pos: [0,1.98,0.3], rot: [40,0,0], color: "dark", parent: "radar" },
      { shape: "sphere", radius: 0.06, pos: [0,2.06,0.37], color: "glow", parent: "radar" },
      // armoire à grilles, radôme, antennes fouet
      { shape: "bevel", size: [0.36,0.3,0.3], pos: [-0.7,0.4,0.68], bevel: 0.03, color: "dark" },
      { shape: "box", size: [0.2,0.04,0.03], pos: [-0.7,0.46,0.84], color: "glow" },
      ...[0.34, 0.39].map((y): Part => ({ shape: "box", size: [0.26,0.02,0.02], pos: [-0.7,y,0.84], color: "black", fine: true })),
      { shape: "box", size: [0.3,0.03,0.24], pos: [-0.7,0.565,0.68], color: "faction" },
      { shape: "lathe", sides: 10, pos: [0.72,0.25,0.7], color: "light", profile: [[0,0],[0.14,0],[0.14,0.1],[0.12,0.18],[0.07,0.24],[0,0.26]] },
      { shape: "tube", radius: 0.012, sides: 4, path: [[0.72,0.25,-0.62],[0.72,0.72,-0.62]], color: "dark", fine: true },
      { shape: "box", size: [0.05,0.08,0.05], pos: [0.72,0.72,-0.62], color: "amber" },
      { shape: "tube", radius: 0.012, sides: 4, path: [[0.82,0.25,-0.48],[0.82,0.6,-0.48]], color: "dark", fine: true },
      { shape: "box", size: [0.05,0.08,0.05], pos: [0.82,0.6,-0.48], color: "amber" },
      { shape: "bevel", size: [0.26,0.08,0.26], pos: [0.77,0.29,-0.55], bevel: 0.02, color: "metal" },
    ],
  },
  // wall : semelle de béton, poteau sombre cerclé d'acier, chaperon d'équipe, filets cyan ; pièces fines : boulons
  // de la semelle, voyant du chaperon
  wall: {
    // poteau fin au centre de la case ; le jeu ajoute un pan (wall_seg) vers chaque mur voisin du même camp
    parts: [
      { shape: "bevel", size: [0.5,0.12,0.5], pos: [0,0.06,0], bevel: 0.03, color: "concrete" },
      { shape: "bevel", size: [0.36,0.98,0.36], pos: [0,0.57,0], bevel: 0.04, color: "dark" },
      { shape: "box", size: [0.38,0.06,0.38], pos: [0,0.3,0], color: "steel" },
      { shape: "box", size: [0.38,0.05,0.38], pos: [0,0.92,0], color: "steel" },
      { shape: "bevel", size: [0.44,0.1,0.44], pos: [0,1.06,0], bevel: 0.03, color: "faction" },
      { shape: "box", size: [0.03,0.5,0.03], pos: [0.13,0.6,0.185], color: "glow", mirror: true },
      ...[[0.2,0.2],[0.2,-0.2]].map(([x, z]): Part => ({ shape: "cylinder", sides: 6, radius: 0.025, height: 0.03, pos: [x,0.13,z], color: "steel", mirror: true, fine: true })),
      { shape: "box", size: [0.06,0.03,0.06], pos: [0,1.12,0], color: "amber", fine: true },
      { shape: "box", size: [0.1,0.04,0.02], pos: [0,0.8,0.185], color: "amber", fine: true },
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
  // wall_seg : pan de mur fin, du centre de la case vers le bord +x (tourné vers chaque voisin) — semelle de béton,
  // voile clair à fruit, chaperon d'équipe, lisses sombres ; pièces fines : joints, couvre-joint
  wall_seg: {
    parts: [
      { shape: "box", size: [0.5,0.1,0.32], pos: [0.25,0.05,0], color: "concrete" },
      { shape: "extrude", profile: [[-0.125,0],[0.125,0],[0.1,0.78],[-0.1,0.78]], depth: 0.5, pos: [0.25,0.08,0], rot: [0,90,0], color: "light" },
      { shape: "box", size: [0.5,0.07,0.24], pos: [0.25,0.9,0], color: "faction" },
      { shape: "box", size: [0.5,0.04,0.02], pos: [0.25,0.62,0.106], color: "dark" },
      { shape: "box", size: [0.5,0.04,0.02], pos: [0.25,0.62,-0.106], color: "dark" },
      { shape: "box", size: [0.02,0.5,0.02], pos: [0.25,0.33,0.11], rot: [-1.5,0,0], color: "dark", fine: true },
      { shape: "box", size: [0.02,0.5,0.02], pos: [0.25,0.33,-0.11], rot: [1.5,0,0], color: "dark", fine: true },
      { shape: "box", size: [0.5,0.02,0.02], pos: [0.25,0.26,0.115], color: "glow", fine: true },
      { shape: "box", size: [0.5,0.02,0.02], pos: [0.25,0.26,-0.115], color: "glow", fine: true },
    ],
  },
  // light_turret : socle rond de béton à segments clairs et anneau cyan, tourelle à pans (dessus d'équipe) portant
  // deux nacelles à deux canons tournés à manchon et cache-flamme ; pièces fines : boulons, lance-fumigènes, antenne
  light_turret: {
    parts: [
      ...socle(2),
      { shape: "lathe", sides: 16, pos: [0,0,0], color: "concrete", profile: [[0,0.25],[0.92,0.25],[0.92,0.38],[0.88,0.44],[0.62,0.5],[0,0.5]] },
      { shape: "torus", radius: 0.925, tube: 0.025, sides: 16, pos: [0,0.34,0], color: "glow" },
      { shape: "bevel", size: [0.5,0.16,0.24], pos: [0,0.5,0.72], bevel: 0.03, color: "light" },
      { shape: "bevel", size: [0.5,0.16,0.24], pos: [0,0.5,-0.72], bevel: 0.03, color: "light" },
      { shape: "bevel", size: [0.24,0.16,0.5], pos: [0.72,0.5,0], bevel: 0.03, color: "light", mirror: true },
      { shape: "box", size: [0.08,0.05,0.03], pos: [0.5,0.42,0.6], rot: [0,45,0], color: "amber", mirror: true },
      ...[45, 135, 225, 315].map((a): Part => ({ shape: "cylinder", sides: 6, radius: 0.03, height: 0.03, pos: [0.75 * Math.sin((a * Math.PI) / 180),0.47,0.75 * Math.cos((a * Math.PI) / 180)], color: "steel", fine: true })),
      // tourelle : couronne d'acier, caisse à pans, dessus d'équipe, filets
      { shape: "cylinder", sides: 16, radius: 0.5, height: 0.2, pos: [0,0.6,0], color: "steel", pivot: "tourelle" },
      { shape: "extrude", profile: [[-0.32,-0.5],[0.32,-0.5],[0.36,0.02],[0.22,0.3],[-0.22,0.3],[-0.36,0.02]], depth: 0.44, bevel: 0.05, pos: [0,0.92,-0.12], rot: [90,0,0], color: "light", parent: "tourelle" },
      { shape: "extrude", profile: [[-0.32,-0.5],[0.32,-0.5],[0.36,0.02],[0.22,0.3],[-0.22,0.3],[-0.36,0.02]], depth: 0.05, bevel: 0.015, pos: [0,1.16,-0.14], rot: [90,0,0], scale: [0.8,0.8,1], color: "faction", parent: "tourelle" },
      { shape: "cylinder", sides: 10, radius: 0.09, height: 0.04, bevel: 0.012, pos: [-0.12,1.19,-0.35], color: "light", parent: "tourelle" },
      { shape: "cylinder", sides: 10, radius: 0.092, height: 0.015, pos: [-0.12,1.18,-0.35], color: "glass", parent: "tourelle" },
      { shape: "box", size: [0.16,0.12,0.03], pos: [0,0.95,0.19], color: "glow", parent: "tourelle" },
      { shape: "box", size: [0.06,0.05,0.03], pos: [0.2,1.04,0.19], color: "amber", mirror: true, parent: "tourelle" },
      { shape: "bevel", size: [0.5,0.14,0.16], pos: [0,0.86,-0.66], bevel: 0.03, color: "dark", parent: "tourelle" },
      // nacelles et canons
      { shape: "bevel", size: [0.26,0.36,0.6], pos: [0.42,0.9,0.05], bevel: 0.04, color: "dark", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.03,0.04,0.4], pos: [0.56,0.98,0.05], color: "glow", mirror: true, parent: "tourelle" },
      ...[0.98, 0.82].map((y): Part => ({ shape: "lathe", sides: 8, pos: [0.42,y,0.32], rot: [90,0,0], color: "steel", mirror: true, parent: "tourelle", profile: [[0,0],[0.07,0],[0.07,0.2],[0.055,0.24],[0.05,0.56],[0.066,0.58],[0.066,0.66],[0,0.66]] })),
      { shape: "bevel", size: [0.2,0.32,0.08], pos: [0.42,0.9,0.82], bevel: 0.02, color: "metal", mirror: true, parent: "tourelle" },
      ...[0, 1].map((i): Part => ({ shape: "cylinder", sides: 6, radius: 0.03, height: 0.12, pos: [0.3,1.1,-0.3 - i * 0.08], rot: [-50,0,-30], color: "dark", mirror: true, parent: "tourelle", fine: true })),
    ],
  },
  // aa_turret : base octogonale de béton à coins blindés, tourelle à pans (dessus d'équipe) et radar de veille,
  // deux nacelles à canons jumelés tournés dressés à 45°, chargeurs à tambour ; pièces fines : boulons, antennes
  aa_turret: {
    parts: [
      ...socle(2),
      { shape: "cylinder", sides: 8, radius: 0.85, height: 0.25, bevel: 0.04, pos: [0,0.37,0], rot: [0,22.5,0], color: "concrete" },
      { shape: "cylinder", sides: 8, radius: 0.6, height: 0.02, pos: [0,0.5,0], rot: [0,22.5,0], color: "dark" },
      { shape: "bevel", size: [0.4,0.2,0.3], pos: [0.55,0.45,0.55], rot: [0,45,0], color: "light", mirror: true },
      { shape: "bevel", size: [0.4,0.2,0.3], pos: [0.55,0.45,-0.55], rot: [0,-45,0], color: "light", mirror: true },
      { shape: "box", size: [0.3,0.04,0.03], pos: [0.5,0.4,0.68], rot: [0,45,0], color: "glow", mirror: true },
      { shape: "box", size: [0.1,0.05,0.03], pos: [0,0.42,0.79], color: "amber" },
      ...[[0.62,0.0],[0,0.62],[0,-0.62]].map(([x, z]): Part => ({ shape: "cylinder", sides: 6, radius: 0.03, height: 0.03, pos: [x,0.5,z], color: "steel", mirror: true, fine: true })),
      // tourelle : couronne d'acier, caisse à pans, dessus d'équipe, radar de veille
      { shape: "cylinder", sides: 16, radius: 0.55, height: 0.2, pos: [0,0.6,0], color: "steel", pivot: "tourelle" },
      { shape: "extrude", profile: [[-0.3,-0.4],[0.3,-0.4],[0.36,-0.2],[0.36,0.2],[0.28,0.32],[-0.28,0.32],[-0.36,0.2],[-0.36,-0.2]], depth: 0.55, bevel: 0.05, pos: [0,0.97,-0.05], rot: [90,0,0], color: "light", parent: "tourelle" },
      { shape: "extrude", profile: [[-0.3,-0.4],[0.3,-0.4],[0.36,-0.2],[0.36,0.2],[0.28,0.32],[-0.28,0.32],[-0.36,0.2],[-0.36,-0.2]], depth: 0.05, bevel: 0.015, pos: [0,1.27,-0.07], rot: [90,0,0], scale: [0.78,0.78,1], color: "faction", parent: "tourelle" },
      { shape: "box", size: [0.36,0.06,0.03], pos: [0,1.04,0.28], color: "glow", parent: "tourelle" },
      { shape: "box", size: [0.06,0.05,0.03], pos: [0.22,0.86,0.28], color: "amber", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.04,0.2,0.04], pos: [0,1.36,-0.32], color: "dark", parent: "tourelle" },
      { shape: "bevel", size: [0.42,0.16,0.04], pos: [0,1.46,-0.35], rot: [-20,0,0], bevel: 0.015, color: "dark", parent: "tourelle" },
      { shape: "box", size: [0.36,0.02,0.02], pos: [0,1.5,-0.33], rot: [-20,0,0], color: "glow", parent: "tourelle" },
      // nacelles, chargeurs à tambour, canons jumelés dressés à 45°
      { shape: "bevel", size: [0.3,0.45,0.6], pos: [0.5,1.0,0], bevel: 0.04, color: "dark", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.03,0.04,0.35], pos: [0.66,1.08,0], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "cylinder", sides: 12, radius: 0.15, height: 0.08, pos: [0.68,0.98,-0.12], rot: [0,0,90], color: "steel", mirror: true, parent: "tourelle" },
      { shape: "cylinder", sides: 8, radius: 0.06, height: 0.02, pos: [0.725,0.98,-0.12], rot: [0,0,90], color: "faction", mirror: true, parent: "tourelle" },
      ...[0.43, 0.57].map((x): Part => ({ shape: "lathe", sides: 8, pos: [x,1.097,0.097], rot: [45,0,0], color: "steel", mirror: true, parent: "tourelle", profile: [[0,0],[0.06,0],[0.06,0.3],[0.045,0.34],[0.042,0.72],[0.055,0.74],[0.055,0.82],[0,0.82]] })),
      { shape: "bevel", size: [0.26,0.12,0.12], pos: [0.5,1.5,0.5], rot: [45,0,0], bevel: 0.02, color: "dark", mirror: true, parent: "tourelle" },
      { shape: "tube", radius: 0.01, sides: 4, path: [[-0.2,1.24,-0.3],[-0.2,1.55,-0.32]], color: "light", parent: "tourelle", fine: true },
    ],
  },
  // heavy_turret : bunker octogonal de béton à plaques claires, grosse tourelle à pans (dessus d'équipe, trappe),
  // masque et canon unique tourné à manchon lumineux et frein de bouche ; pièces fines : fentes du frein,
  // lance-fumigènes, épiscopes, antenne
  heavy_turret: {
    parts: [
      ...socle(2),
      { shape: "lathe", sides: 8, pos: [0,0,0], rot: [0,22.5,0], color: "concrete", profile: [[0,0.25],[0.9,0.25],[0.9,0.35],[0.8,0.55],[0,0.55]] },
      { shape: "bevel", size: [0.55,0.2,0.3], pos: [0.55,0.5,0.62], bevel: 0.03, color: "light", mirror: true },
      { shape: "bevel", size: [0.3,0.2,0.55], pos: [0.65,0.5,-0.45], bevel: 0.03, color: "light", mirror: true },
      { shape: "box", size: [0.1,0.05,0.03], pos: [0.55,0.42,0.86], color: "amber", mirror: true },
      { shape: "box", size: [0.03,0.04,0.4], pos: [0.86,0.36,0.1], color: "glow", mirror: true },
      { shape: "torus", radius: 0.7, tube: 0.02, sides: 16, pos: [0,0.555,0], color: "steel", fine: true },
      // tourelle : couronne, caisse à pans, jupes sombres, dessus d'équipe, trappe, épiscopes
      { shape: "cylinder", sides: 16, radius: 0.68, height: 0.2, pos: [0,0.65,0], color: "steel", pivot: "tourelle" },
      { shape: "extrude", profile: [[-0.5,-0.55],[0.5,-0.55],[0.56,0.0],[0.36,0.42],[-0.36,0.42],[-0.56,0.0]], depth: 0.55, bevel: 0.06, pos: [0,1.0,-0.3], rot: [90,0,0], color: "light", parent: "tourelle" },
      { shape: "bevel", size: [0.14,0.4,0.8], pos: [0.58,0.95,-0.4], bevel: 0.03, color: "dark", mirror: true, parent: "tourelle" },
      { shape: "extrude", profile: [[-0.5,-0.55],[0.5,-0.55],[0.56,0.0],[0.36,0.42],[-0.36,0.42],[-0.56,0.0]], depth: 0.05, bevel: 0.015, pos: [0,1.29,-0.33], rot: [90,0,0], scale: [0.8,0.8,1], color: "faction", parent: "tourelle" },
      { shape: "cylinder", sides: 10, radius: 0.14, height: 0.05, bevel: 0.015, pos: [-0.2,1.335,-0.5], color: "light", parent: "tourelle" },
      { shape: "cylinder", sides: 10, radius: 0.1, height: 0.04, pos: [0.22,1.32,-0.55], color: "dark", parent: "tourelle", fine: true },
      { shape: "box", size: [0.04,0.25,0.03], pos: [0.3,1.0,0.11], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.06,0.05,0.03], pos: [0.5,1.1,0.04], rot: [0,-40,0], color: "amber", mirror: true, parent: "tourelle" },
      { shape: "bevel", size: [0.6,0.16,0.18], pos: [0,0.92,-0.88], bevel: 0.03, color: "dark", parent: "tourelle" },
      // masque et canon
      { shape: "bevel", size: [0.46,0.42,0.3], pos: [0,0.98,0.22], bevel: 0.05, color: "dark", parent: "tourelle" },
      { shape: "lathe", sides: 12, pos: [0,0.98,0.3], rot: [90,0,0], color: "steel", parent: "tourelle", profile: [[0,0],[0.16,0],[0.16,0.08],[0.13,0.12],[0.12,0.42],[0.14,0.44],[0.14,0.5],[0.115,0.52],[0.115,0.57],[0.17,0.59],[0.17,0.7],[0,0.7]] },
      { shape: "torus", radius: 0.125, tube: 0.025, sides: 12, pos: [0,0.98,0.5], rot: [90,0,0], color: "glow", parent: "tourelle" },
      ...[-1, 1].map((s): Part => ({ shape: "box", size: [0.04,0.06,0.07], pos: [s * 0.16,0.98,0.94], color: "black", parent: "tourelle", fine: true })),
      ...[0, 1, 2].map((i): Part => ({ shape: "cylinder", sides: 6, radius: 0.035, height: 0.14, pos: [0.46,1.18,-0.05 - i * 0.09], rot: [-60,0,-25], color: "dark", mirror: true, parent: "tourelle", fine: true })),
      { shape: "tube", radius: 0.012, sides: 4, path: [[0.3,1.3,-0.7],[0.3,1.36,-0.72]], color: "light", parent: "tourelle", fine: true },
    ],
  },
  // fixed_artillery : base de béton à coins blindés, couronne d'acier, tourelle à pans (dessus d'équipe) et long tube
  // tourné relevé à 20° (manchons, frein de bouche) sur culasse, deux freins de recul ; pièces fines : boulons,
  // obus du râtelier, antenne
  fixed_artillery: {
    parts: [
      ...socle(3),
      ...filets(3),
      { shape: "bevel", size: [2.4,0.4,2.4], pos: [0,0.45,0], bevel: 0.08, color: "concrete" },
      { shape: "bevel", size: [0.6,0.5,0.6], pos: [1.0,0.6,1.0], bevel: 0.06, color: "light", mirror: true },
      { shape: "bevel", size: [0.6,0.5,0.6], pos: [1.0,0.6,-1.0], bevel: 0.06, color: "light", mirror: true },
      { shape: "box", size: [0.5,0.04,0.5], pos: [1.0,0.86,1.0], color: "faction", mirror: true },
      { shape: "box", size: [0.5,0.04,0.5], pos: [1.0,0.86,-1.0], color: "faction", mirror: true },
      { shape: "box", size: [0.12,0.06,0.03], pos: [1.0,0.6,1.31], color: "amber", mirror: true },
      { shape: "box", size: [0.03,0.05,0.8], pos: [1.21,0.5,0], color: "glow", mirror: true },
      { shape: "cylinder", sides: 16, radius: 1.0, height: 0.25, bevel: 0.04, pos: [0,0.77,0], color: "steel" },
      ...[0, 45, 90, 135, 180, 225, 270, 315].map((a): Part => ({ shape: "cylinder", sides: 6, radius: 0.03, height: 0.03, pos: [0.95 * Math.sin((a * Math.PI) / 180),0.9,0.95 * Math.cos((a * Math.PI) / 180)], color: "dark", fine: true })),
      // tourelle
      { shape: "cylinder", sides: 16, radius: 0.9, height: 0.25, pos: [0,0.95,0], color: "metal", pivot: "tourelle" },
      { shape: "extrude", profile: [[-0.6,-0.7],[0.6,-0.7],[0.62,0.25],[0.38,0.6],[-0.38,0.6],[-0.62,0.25]], depth: 0.75, bevel: 0.06, pos: [0,1.4,-0.35], rot: [90,0,0], color: "light", parent: "tourelle" },
      { shape: "bevel", size: [0.16,0.6,1.1], pos: [0.66,1.35,-0.45], bevel: 0.03, color: "dark", mirror: true, parent: "tourelle" },
      { shape: "extrude", profile: [[-0.6,-0.7],[0.6,-0.7],[0.62,0.25],[0.38,0.6],[-0.38,0.6],[-0.62,0.25]], depth: 0.06, bevel: 0.015, pos: [0,1.8,-0.38], rot: [90,0,0], scale: [0.82,0.82,1], color: "faction", parent: "tourelle" },
      { shape: "box", size: [0.03,0.04,0.8], pos: [0.75,1.45,-0.45], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.1,0.06,0.03], pos: [0.4,1.2,0.26], color: "amber", mirror: true, parent: "tourelle" },
      { shape: "cylinder", sides: 10, radius: 0.14, height: 0.05, bevel: 0.015, pos: [-0.3,1.85,-0.75], color: "light", parent: "tourelle" },
      ...[-0.15, 0, 0.15].map((x): Part => ({ shape: "cylinder", sides: 8, radius: 0.05, height: 0.3, pos: [x,1.88,-0.38], rot: [0,0,90], color: "copper", parent: "tourelle", fine: true })),
      { shape: "tube", radius: 0.012, sides: 4, path: [[0.45,1.83,-0.9],[0.45,2.0,-0.92]], color: "light", parent: "tourelle", fine: true },
      // culasse, freins de recul, tube relevé à 20°
      { shape: "bevel", size: [0.5,0.45,0.35], pos: [0,1.42,0.3], bevel: 0.05, color: "dark", parent: "tourelle" },
      ...[-0.15, 0.15].map((x): Part => ({ shape: "cylinder", sides: 10, radius: 0.05, height: 0.5, pos: [x,1.536,0.535], rot: [70,0,0], color: "steel", parent: "tourelle" })),
      { shape: "lathe", sides: 12, pos: [0,1.45,0.3], rot: [70,0,0], color: "steel", parent: "tourelle", profile: [[0,0],[0.17,0],[0.17,0.22],[0.12,0.27],[0.1,0.6],[0.115,0.62],[0.115,0.66],[0.095,0.68],[0.09,1.02],[0.15,1.05],[0.15,1.19],[0.12,1.21],[0,1.21]] },
      { shape: "box", size: [0.03,0.04,0.8], pos: [0,1.74,0.78], rot: [-20,0,0], color: "glow", parent: "tourelle" },
      ...[-1, 1].map((s): Part => ({ shape: "box", size: [0.04,0.06,0.08], pos: [s * 0.15,1.83,1.38], rot: [-20,0,0], color: "black", parent: "tourelle", fine: true })),
    ],
  },
  // shield_gen : générateur étagé octogonal (bas sombre, étage clair, contreforts), bobines de cuivre et anneaux
  // lumineux, anneau au sol, émetteur tournant (sphère lumineuse et deux anneaux gyroscopiques) ; pièces fines :
  // griffes de l'émetteur, boulons
  shield_gen: {
    parts: [
      ...socle(2),
      { shape: "torus", radius: 0.92, tube: 0.025, sides: 16, pos: [0,0.27,0], color: "glow" },
      { shape: "cylinder", sides: 16, radius: 0.86, height: 0.05, pos: [0,0.275,0], color: "dark" },
      { shape: "lathe", sides: 8, pos: [0,0,0], rot: [0,22.5,0], color: "dark", profile: [[0,0.3],[0.72,0.3],[0.72,0.58],[0.6,0.66],[0,0.66]] },
      { shape: "bevel", size: [0.5,0.34,0.24], pos: [0,0.56,0.62], bevel: 0.04, color: "light" },
      { shape: "bevel", size: [0.5,0.34,0.24], pos: [0,0.56,-0.62], bevel: 0.04, color: "light" },
      { shape: "bevel", size: [0.24,0.34,0.5], pos: [0.62,0.56,0], bevel: 0.04, color: "light", mirror: true },
      { shape: "box", size: [0.3,0.03,0.2], pos: [0,0.745,0.62], color: "faction" },
      { shape: "box", size: [0.3,0.03,0.2], pos: [0,0.745,-0.62], color: "faction" },
      { shape: "box", size: [0.2,0.03,0.3], pos: [0.62,0.745,0], color: "faction", mirror: true },
      { shape: "box", size: [0.1,0.06,0.03], pos: [0.45,0.45,0.66], color: "amber", mirror: true },
      // étage clair, bobines de cuivre, dessus d'équipe
      { shape: "lathe", sides: 8, pos: [0,0,0], rot: [0,22.5,0], color: "light", profile: [[0,0.64],[0.5,0.64],[0.5,0.96],[0.38,1.04],[0,1.04]] },
      ...[0.74, 0.86].map((y): Part => ({ shape: "torus", radius: 0.5, tube: 0.035, sides: 16, pos: [0,y,0], color: "copper" })),
      { shape: "box", size: [0.5,0.05,0.03], pos: [0,0.92,0.47], color: "glow" },
      { shape: "cylinder", sides: 8, radius: 0.36, height: 0.05, pos: [0,1.05,0], rot: [0,22.5,0], color: "faction" },
      { shape: "cylinder", sides: 12, radius: 0.28, height: 0.2, bevel: 0.03, pos: [0,1.15,0], color: "steel" },
      { shape: "torus", radius: 0.29, tube: 0.025, sides: 16, pos: [0,1.22,0], color: "glow" },
      ...[0, 120, 240].map((a): Part => ({ shape: "bevel", size: [0.06,0.22,0.08], pos: [0.24 * Math.sin((a * Math.PI) / 180),1.3,0.24 * Math.cos((a * Math.PI) / 180)], rot: [0,a,0], bevel: 0.015, color: "light", fine: true })),
      // émetteur (tourne) : sphère lumineuse, anneaux gyroscopiques
      { shape: "sphere", radius: 0.24, detail: 1, pos: [0,1.42,0], color: "glow", pivot: "emetteur" },
      { shape: "torus", radius: 0.28, tube: 0.022, sides: 16, pos: [0,1.42,0], rot: [60,0,0], color: "light", parent: "emetteur" },
      { shape: "torus", radius: 0.28, tube: 0.022, sides: 16, pos: [0,1.42,0], rot: [60,90,0], color: "steel", parent: "emetteur" },
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
  // gate : grand anneau vertical (tore d'équipe à huit colliers sombres à filets), portail lumineux concentrique
  // vitré, pieds blindés à contreforts sur dalle, coiffe à feu ambre ; pièces fines : câbles, boulons, marches
  gate: {
    parts: [
      { shape: "bevel", size: [3.6,0.2,1.4], pos: [0,0.1,0], bevel: 0.06, color: "concrete" },
      { shape: "bevel", size: [2.6,0.12,1.8], pos: [0,0.26,0], bevel: 0.04, color: "metal" },
      { shape: "box", size: [1.2,0.03,0.2], pos: [0,0.33,0.75], color: "hazard" },
      { shape: "box", size: [1.2,0.03,0.2], pos: [0,0.33,-0.75], color: "hazard" },
      { shape: "box", size: [0.03,0.04,0.8], pos: [1.79,0.1,0], color: "glow", mirror: true },
      // pieds latéraux à contreforts
      { shape: "bevel", size: [0.7,0.6,1.3], pos: [1.45,0.45,0], bevel: 0.06, color: "dark", mirror: true },
      { shape: "bevel", size: [0.5,0.4,0.9], pos: [1.45,0.9,0], bevel: 0.05, color: "light", mirror: true },
      { shape: "extrude", profile: [[-0.3,0],[0.3,0],[0.3,0.1],[0.08,0.5],[-0.08,0.5],[-0.3,0.1]], depth: 0.12, pos: [1.45,0.75,0.5], color: "light", mirror: true },
      { shape: "extrude", profile: [[-0.3,0],[0.3,0],[0.3,0.1],[0.08,0.5],[-0.08,0.5],[-0.3,0.1]], depth: 0.12, pos: [1.45,0.75,-0.5], color: "light", mirror: true },
      { shape: "box", size: [0.1,0.06,0.03], pos: [1.45,0.5,0.66], color: "amber", mirror: true },
      ...[[1.2,0.5],[1.7,0.5],[1.2,-0.5],[1.7,-0.5]].map(([x, z]): Part => ({ shape: "cylinder", sides: 6, radius: 0.03, height: 0.03, pos: [x,0.76,z], color: "steel", mirror: true, fine: true })),
      ...[0.36, 0.44].map((y, i): Part => ({ shape: "box", size: [0.8,0.04,0.14 - i * 0.06], pos: [0,y - 0.04,0.82 - i * 0.03], color: "metal", fine: true })),
      // anneau : tore d'équipe, colliers sombres à filets, filet intérieur
      { shape: "torus", radius: 1.5, tube: 0.22, sides: 24, pos: [0,2.1,0], rot: [90,0,0], color: "faction" },
      ...[0, 45, 90, 135, 180, 225, 270, 315].map((a): Part => ({ shape: "bevel", size: [0.5,0.55,0.7], pos: [1.5 * Math.sin((a * Math.PI) / 180),2.1 + 1.5 * Math.cos((a * Math.PI) / 180),0], rot: [0,0,-a], bevel: 0.06, color: a % 90 === 0 ? "light" : "dark" })),
      ...[45, 135, 225, 315].map((a): Part => ({ shape: "box", size: [0.3,0.04,0.03], pos: [1.5 * Math.sin((a * Math.PI) / 180),2.1 + 1.5 * Math.cos((a * Math.PI) / 180),0.36], rot: [0,0,-a], color: "glow" })),
      { shape: "box", size: [0.06,0.12,0.03], pos: [1.5,2.1,0.36], color: "amber", mirror: true },
      { shape: "torus", radius: 1.28, tube: 0.04, sides: 24, pos: [0,2.1,0], rot: [90,0,0], color: "glow" },
      { shape: "bevel", size: [0.9,0.3,0.7], pos: [0,3.85,0], bevel: 0.06, color: "light" },
      { shape: "bevel", size: [0.6,0.04,0.5], pos: [0,3.99,0], bevel: 0.015, color: "faction" },
      // portail lumineux : voile vitré, anneaux, cœur
      { shape: "cylinder", sides: 24, radius: 1.26, height: 0.04, pos: [0,2.1,0], rot: [90,0,0], color: "glass" },
      { shape: "torus", radius: 0.92, tube: 0.035, sides: 16, pos: [0,2.1,0], rot: [90,0,0], color: "glow" },
      { shape: "torus", radius: 0.55, tube: 0.045, sides: 16, pos: [0,2.1,0], rot: [90,0,0], color: "glow" },
      { shape: "sphere", radius: 0.2, detail: 1, pos: [0,2.1,0], scale: [1,1,0.4], color: "glow" },
      // câbles des pieds à l'anneau
      { shape: "tube", radius: 0.035, path: [[1.3,1.1,0.32],[1.3,1.4,0.3],[1.18,1.6,0.24]], bend: 0.12, color: "rubber", mirror: true, fine: true },
    ],
  },
  // area_shield : base étagée (dessus d'équipe), colonne d'émission octogonale à noyau lumineux, coupe tournée
  // à lèvre lumineuse, émetteur tournant (sphère et couronne), deux pylônes à isolateurs et anneaux lumineux ;
  // pièces fines : câbles, boulons, disques des isolateurs
  area_shield: {
    parts: [
      ...socle(3),
      ...filets(3),
      { shape: "bevel", size: [2.4,0.35,2.4], pos: [0,0.42,0], bevel: 0.08, color: "dark" },
      { shape: "bevel", size: [2.0,0.08,2.0], pos: [0,0.63,0], bevel: 0.03, color: "faction" },
      { shape: "bevel", size: [0.8,0.3,0.4], pos: [0,0.5,1.12], bevel: 0.04, color: "light" },
      { shape: "bevel", size: [0.4,0.3,0.8], pos: [1.12,0.5,0.3], bevel: 0.04, color: "light", mirror: true },
      { shape: "box", size: [0.1,0.06,0.03], pos: [0.3,0.5,1.33], color: "amber", mirror: true },
      ...[[0.9,0.9],[0.9,-0.9]].map(([x, z]): Part => ({ shape: "cylinder", sides: 6, radius: 0.035, height: 0.03, pos: [x,0.68,z], color: "steel", mirror: true, fine: true })),
      // colonne octogonale, contreforts clairs, noyau lumineux
      { shape: "cylinder", sides: 8, radius: 0.5, radiusTop: 0.44, height: 1.2, bevel: 0.04, pos: [0,1.25,0], rot: [0,22.5,0], color: "dark" },
      { shape: "bevel", size: [0.16,1.0,0.6], pos: [0.48,1.2,0], bevel: 0.04, color: "light", mirror: true },
      { shape: "bevel", size: [0.5,0.64,0.08], pos: [0,1.2,0.46], bevel: 0.03, color: "black" },
      { shape: "box", size: [0.36,0.5,0.03], pos: [0,1.2,0.5], color: "glow" },
      ...[0.98, 1.2, 1.42].map((y): Part => ({ shape: "box", size: [0.4,0.025,0.02], pos: [0,y,0.52], color: "dark", fine: true })),
      { shape: "torus", radius: 0.47, tube: 0.03, sides: 16, pos: [0,1.8,0], color: "steel" },
      // coupe émettrice tournée à lèvre lumineuse
      { shape: "lathe", sides: 16, pos: [0,1.85,0], color: "light", profile: [[0,0],[0.35,0],[0.55,0.14],[0.8,0.34],[0.86,0.4],[0.8,0.42],[0.55,0.26],[0.3,0.2],[0,0.2]] },
      { shape: "torus", radius: 0.83, tube: 0.025, sides: 16, pos: [0,2.26,0], color: "glow" },
      { shape: "cylinder", sides: 16, radius: 0.5, height: 0.02, pos: [0,2.13,0], color: "glow" },
      // émetteur (tourne) : sphère, couronne sombre, deux globes
      { shape: "sphere", radius: 0.3, detail: 1, pos: [0,2.45,0], color: "glow", pivot: "emetteur" },
      { shape: "torus", radius: 0.38, tube: 0.03, sides: 16, pos: [0,2.45,0], color: "dark", parent: "emetteur" },
      { shape: "box", size: [0.9,0.05,0.08], pos: [0,2.45,0], color: "dark", parent: "emetteur" },
      { shape: "sphere", radius: 0.06, pos: [0.45,2.45,0], color: "amber", mirror: true, parent: "emetteur" },
      // pylônes : fût d'acier, isolateurs à disques, anneaux lumineux, coiffe et feu
      { shape: "cylinder", sides: 10, radius: 0.28, height: 0.12, bevel: 0.03, pos: [1.0,0.72,-0.6], color: "steel", mirror: true },
      { shape: "cylinder", sides: 10, radius: 0.16, radiusTop: 0.12, height: 1.0, pos: [1.0,1.25,-0.6], color: "light", mirror: true },
      ...[0.95, 1.15, 1.35].map((y): Part => ({ shape: "torus", radius: 0.22, tube: 0.035, sides: 12, pos: [1.0,y,-0.6], color: "glow", mirror: true })),
      ...[1.05, 1.25, 1.45, 1.6].map((y): Part => ({ shape: "cylinder", sides: 8, radius: 0.18, height: 0.025, pos: [1.0,y,-0.6], color: "dark", mirror: true, fine: true })),
      { shape: "cylinder", sides: 10, radius: 0.24, height: 0.12, bevel: 0.03, pos: [1.0,1.76,-0.6], color: "faction", mirror: true },
      { shape: "box", size: [0.04,0.2,0.04], pos: [1.0,1.92,-0.6], color: "metal", mirror: true },
      { shape: "sphere", radius: 0.07, pos: [1.0,2.05,-0.6], color: "amber", mirror: true },
      { shape: "tube", radius: 0.03, path: [[0.8,0.72,-0.6],[0.6,0.72,-0.5],[0.5,0.9,-0.3]], bend: 0.1, color: "rubber", mirror: true, fine: true },
    ],
  },
  // crystal_reactor : cristal cyan géant (cristal) tenu par quatre griffes profilées au-dessus d'un cœur d'acier
  // tourné à anneau lumineux, couronne de segments clairs à pans inclinés (dessus d'équipe) et de segments sombres
  // à isolateurs, soubassement de béton cerclé de lumière ; pièces fines : conduites de cuivre, boulons
  crystal_reactor: {
    parts: [
      ...socle(4),
      ...filets(4),
      { shape: "lathe", sides: 16, pos: [0,0,0], color: "concrete", profile: [[0,0.25],[1.9,0.25],[1.9,0.45],[1.82,0.55],[0,0.55]] },
      { shape: "torus", radius: 1.9, tube: 0.03, sides: 16, pos: [0,0.42,0], color: "glow" },
      // couronne : segments clairs à face intérieure inclinée, dessus d'équipe, filets
      ...[0, 90, 180, 270].map((a): Part => ({ shape: "extrude", profile: [[-0.25,0],[0.25,0],[0.25,0.5],[0.05,0.8],[-0.25,0.8]], depth: 1.0, bevel: 0.03, pos: [1.5 * Math.sin((a * Math.PI) / 180),0.55,1.5 * Math.cos((a * Math.PI) / 180)], rot: [0,90 + a,0], color: "light" })),
      ...[0, 90, 180, 270].map((a): Part => ({ shape: "bevel", size: [0.92,0.1,0.32], pos: [1.6 * Math.sin((a * Math.PI) / 180),1.38,1.6 * Math.cos((a * Math.PI) / 180)], rot: [0,a,0], bevel: 0.03, color: "faction" })),
      ...[0, 90, 180, 270].map((a): Part => ({ shape: "box", size: [0.6,0.05,0.03], pos: [1.27 * Math.sin((a * Math.PI) / 180),1.12,1.27 * Math.cos((a * Math.PI) / 180)], rot: [-38,a,0], color: "glow" })),
      ...[45, 135, 225, 315].map((a): Part => ({ shape: "bevel", size: [0.8,0.6,0.5], pos: [1.5 * Math.sin((a * Math.PI) / 180),0.85,1.5 * Math.cos((a * Math.PI) / 180)], rot: [0,a,0], color: "dark" })),
      ...[45, 135, 225, 315].map((a): Part => ({ shape: "box", size: [0.12,0.06,0.03], pos: [1.76 * Math.sin((a * Math.PI) / 180),0.9,1.76 * Math.cos((a * Math.PI) / 180)], rot: [0,a,0], color: "amber" })),
      ...[45, 135, 225, 315].map((a): Part => ({ shape: "lathe", sides: 8, pos: [1.5 * Math.sin((a * Math.PI) / 180),1.15,1.5 * Math.cos((a * Math.PI) / 180)], color: "light", profile: [[0,0],[0.1,0],[0.1,0.05],[0.07,0.07],[0.12,0.1],[0.07,0.14],[0.12,0.17],[0.06,0.22],[0,0.24]] })),
      ...[45, 135, 225, 315].map((a): Part => ({ shape: "tube", radius: 0.045, path: [[1.25 * Math.sin((a * Math.PI) / 180),0.75,1.25 * Math.cos((a * Math.PI) / 180)],[0.98 * Math.sin((a * Math.PI) / 180),0.75,0.98 * Math.cos((a * Math.PI) / 180)]], color: "copper", fine: true })),
      // cœur d'acier tourné, anneau lumineux, griffes
      { shape: "lathe", sides: 16, pos: [0,0,0], color: "steel", profile: [[0,0.55],[1.0,0.55],[1.0,0.9],[0.9,1.02],[0.62,1.08],[0,1.08]] },
      { shape: "torus", radius: 0.78, tube: 0.04, sides: 16, pos: [0,1.06,0], color: "glow" },
      ...[0, 45, 90, 135, 180, 225, 270, 315].map((a): Part => ({ shape: "cylinder", sides: 6, radius: 0.03, height: 0.03, pos: [0.95 * Math.sin((a * Math.PI) / 180),0.91,0.95 * Math.cos((a * Math.PI) / 180)], color: "dark", fine: true })),
      ...[0, 90, 180, 270].map((a): Part => ({ shape: "extrude", profile: [[-1.0,1.0],[-0.82,1.0],[-0.62,1.55],[-0.42,1.98],[-0.5,2.05],[-0.75,1.65]], depth: 0.2, bevel: 0.02, rot: [0,90 + a,0], color: "light" })),
      ...[0, 90, 180, 270].map((a): Part => ({ shape: "box", size: [0.04,0.4,0.03], pos: [0.74 * Math.sin((a * Math.PI) / 180),1.45,0.74 * Math.cos((a * Math.PI) / 180)], rot: [0,a,0], color: "glow" })),
      // cristal (tourne)
      { shape: "cone", sides: 6, radius: 0.62, height: 1.8, pos: [0,2.3,0], color: "glow", pivot: "cristal" },
      { shape: "cone", sides: 6, radius: 0.62, height: 0.7, pos: [0,1.05,0], rot: [180,0,0], color: "glow", parent: "cristal" },
      { shape: "cone", sides: 5, radius: 0.25, height: 1.1, pos: [0.42,1.85,0.15], rot: [0,0,-25], color: "glow", parent: "cristal" },
      { shape: "cone", sides: 5, radius: 0.22, height: 0.9, pos: [-0.4,1.75,-0.2], rot: [10,0,25], color: "glow", parent: "cristal" },
      { shape: "cone", sides: 5, radius: 0.2, height: 0.8, pos: [0.05,1.7,0.45], rot: [25,0,0], color: "glow", parent: "cristal" },
      { shape: "cone", sides: 5, radius: 0.16, height: 0.6, pos: [-0.2,1.62,0.38], rot: [20,0,20], color: "crystal", parent: "cristal" },
      { shape: "cone", sides: 5, radius: 0.15, height: 0.55, pos: [0.3,1.6,-0.38], rot: [-22,0,-15], color: "crystal", parent: "cristal" },
    ],
  },
  // missile_silo : ogive tournée (bande rouge, ailerons) dressée dans un puits à collerette de béton cerclée de
  // lumière, quatre portes blindées ouvertes sur charnières et vérins (dessus d'équipe), blocs d'angle à évents ;
  // pièces fines : vérins, bras ombilicaux, boulons, feux de balisage
  missile_silo: {
    parts: [
      ...socle(3),
      ...filets(3),
      { shape: "lathe", sides: 16, pos: [0,0,0], color: "concrete", profile: [[0,0.25],[1.4,0.25],[1.4,0.55],[1.3,0.65],[0.8,0.66],[0.75,0.62],[0,0.62]] },
      { shape: "torus", radius: 1.41, tube: 0.03, sides: 16, pos: [0,0.42,0], color: "glow" },
      { shape: "cylinder", sides: 16, radius: 0.76, height: 0.02, pos: [0,0.63,0], color: "black" },
      { shape: "torus", radius: 0.78, tube: 0.025, sides: 16, pos: [0,0.655,0], color: "hazard" },
      // missile : corps tourné, bandes, ailerons, bras ombilicaux
      { shape: "lathe", sides: 16, pos: [0,0,0], color: "light", profile: [[0,0.6],[0.26,0.6],[0.3,0.66],[0.32,0.72],[0.32,1.5],[0.3,1.66],[0.24,1.88],[0.15,2.08],[0.06,2.24],[0,2.3]] },
      { shape: "cylinder", sides: 16, radius: 0.325, height: 0.1, pos: [0,1.2,0], color: "red" },
      { shape: "cylinder", sides: 16, radius: 0.325, height: 0.08, pos: [0,1.45,0], color: "faction" },
      { shape: "cylinder", sides: 16, radius: 0.305, height: 0.04, pos: [0,1.68,0], color: "dark" },
      ...[45, 135, 225, 315].map((a): Part => ({ shape: "extrude", profile: [[-0.3,0],[-0.44,0],[-0.44,0.12],[-0.3,0.34]], depth: 0.03, pos: [0,0.68,0], rot: [0,90 + a,0], color: "dark" })),
      ...[0, 180].map((a): Part => ({ shape: "box", size: [0.04,0.04,0.42], pos: [0.52 * Math.sin((a * Math.PI) / 180),0.95,0.52 * Math.cos((a * Math.PI) / 180)], rot: [0,a,0], color: "steel", fine: true })),
      // portes ouvertes (dessus aux couleurs de l'équipe), charnières, vérins
      { shape: "bevel", size: [0.9,1.1,0.22], pos: [0,1.1,0.95], rot: [20,0,0], color: "light" },
      { shape: "bevel", size: [0.9,1.1,0.22], pos: [0,1.1,-0.95], rot: [-20,0,0], color: "light" },
      { shape: "bevel", size: [0.22,1.1,0.9], pos: [0.95,1.1,0], rot: [0,0,-20], color: "light", mirror: true },
      { shape: "bevel", size: [0.92,0.1,0.26], pos: [0,1.62,1.14], rot: [20,0,0], bevel: 0.03, color: "faction" },
      { shape: "bevel", size: [0.92,0.1,0.26], pos: [0,1.62,-1.14], rot: [-20,0,0], bevel: 0.03, color: "faction" },
      { shape: "bevel", size: [0.26,0.1,0.92], pos: [1.14,1.62,0], rot: [0,0,-20], bevel: 0.03, color: "faction", mirror: true },
      ...[0.82, -0.82].map((z): Part => ({ shape: "box", size: [0.5,0.05,0.025], pos: [0,1.1,z * 1.11], rot: [z > 0 ? 20 : -20,0,0], color: "hazard" })),
      { shape: "box", size: [0.1,0.06,0.03], pos: [0,0.95,1.08], rot: [20,0,0], color: "amber" },
      { shape: "box", size: [0.03,0.06,0.1], pos: [1.08,0.95,0], rot: [0,0,-20], color: "amber", mirror: true },
      { shape: "cylinder", sides: 10, radius: 0.07, height: 0.8, pos: [0,0.7,0.82], rot: [0,0,90], color: "steel" },
      { shape: "cylinder", sides: 10, radius: 0.07, height: 0.8, pos: [0,0.7,-0.82], rot: [0,0,90], color: "steel" },
      { shape: "cylinder", sides: 10, radius: 0.07, height: 0.8, pos: [0.82,0.7,0], rot: [90,0,0], color: "steel", mirror: true },
      ...[0.3, -0.3].map((x): Part => ({ shape: "tube", radius: 0.025, path: [[x,0.66,1.28],[x,1.2,1.2]], color: "steel", fine: true })),
      ...[0.3, -0.3].map((x): Part => ({ shape: "tube", radius: 0.025, path: [[x,0.66,-1.28],[x,1.2,-1.2]], color: "steel", fine: true })),
      ...[0.3, -0.3].map((z): Part => ({ shape: "tube", radius: 0.025, path: [[1.28,0.66,z],[1.2,1.2,z]], color: "steel", mirror: true, fine: true })),
      // blocs d'angle à évents et filets
      { shape: "bevel", size: [0.5,0.55,0.5], pos: [0.98,0.7,0.98], rot: [0,45,0], color: "metal", mirror: true },
      { shape: "bevel", size: [0.5,0.55,0.5], pos: [0.98,0.7,-0.98], rot: [0,45,0], color: "metal", mirror: true },
      { shape: "box", size: [0.25,0.04,0.03], pos: [1.15,0.8,1.15], rot: [0,45,0], color: "glow", mirror: true },
      ...[0.98, -0.98].map((z): Part => ({ shape: "box", size: [0.34,0.03,0.34], pos: [0.98,0.985,z], rot: [0,45,0], color: "faction", mirror: true })),
      ...[0.98, -0.98].map((z): Part => ({ shape: "cylinder", sides: 10, radius: 0.08, height: 0.1, pos: [0.98,1.02,z], color: "dark", mirror: true, fine: true })),
      ...[[1.35,1.35],[1.35,-1.35]].map(([x, z]): Part => ({ shape: "sphere", radius: 0.04, pos: [x,0.3,z], color: "amber", mirror: true, fine: true })),
    ],
  },
  // antimissile : base sombre à plaques claires et capteurs latéraux, affût tournant d'acier portant quatre tubes
  // de lancement tournés cerclés de colliers (coiffes d'équipe à filet lumineux) ; pièces fines : boulons,
  // conduites, coiffes de tir
  antimissile: {
    parts: [
      ...socle(2),
      ...filets(2, 2, false),
      { shape: "bevel", size: [1.6,0.3,1.4], pos: [0,0.4,0], bevel: 0.06, color: "dark" },
      { shape: "bevel", size: [1.3,0.05,1.1], pos: [0,0.565,0], bevel: 0.02, color: "light" },
      { shape: "lathe", sides: 10, pos: [0.75,0.55,0.15], rot: [90,0,0], color: "light", mirror: true, profile: [[0,0],[0.13,0],[0.13,0.3],[0.11,0.36],[0,0.38]] },
      { shape: "cylinder", sides: 10, radius: 0.09, height: 0.03, pos: [0.75,0.55,0.52], rot: [90,0,0], color: "amber", mirror: true },
      { shape: "box", size: [0.03,0.04,0.5], pos: [0.81,0.36,-0.2], color: "glow", mirror: true },
      ...[[0.62,0.55],[0.62,-0.55]].map(([x, z]): Part => ({ shape: "cylinder", sides: 6, radius: 0.025, height: 0.03, pos: [x,0.6,z], color: "steel", mirror: true, fine: true })),
      // affût tournant
      { shape: "cylinder", sides: 16, radius: 0.55, height: 0.2, pos: [0,0.65,0], color: "steel", pivot: "tourelle" },
      { shape: "bevel", size: [1.0,0.25,0.9], pos: [0,0.85,0], bevel: 0.05, color: "dark", parent: "tourelle" },
      { shape: "box", size: [0.03,0.04,0.6], pos: [0.5,0.85,0], color: "glow", mirror: true, parent: "tourelle" },
      // tubes de lancement, colliers, coiffes d'équipe
      ...[0.2, -0.2].map((z): Part => ({ shape: "lathe", sides: 12, pos: [0.21,0,z], color: "light", mirror: true, parent: "tourelle", profile: [[0,0.95],[0.17,0.95],[0.17,2.2],[0.15,2.23],[0,2.23]] })),
      ...[1.25, 1.85].map((y): Part => ({ shape: "bevel", size: [0.86,0.09,0.86], pos: [0,y,0], bevel: 0.025, color: "dark", parent: "tourelle" })),
      ...[0.2, -0.2].map((z): Part => ({ shape: "cylinder", sides: 12, radius: 0.175, height: 0.1, bevel: 0.025, pos: [0.21,2.28,z], color: "faction", mirror: true, parent: "tourelle" })),
      ...[0.2, -0.2].map((z): Part => ({ shape: "cylinder", sides: 8, radius: 0.08, height: 0.02, pos: [0.21,2.33,z], color: "dark", mirror: true, parent: "tourelle", fine: true })),
      { shape: "box", size: [0.05,0.5,0.03], pos: [0.21,1.55,0.385], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.06,0.05,0.03], pos: [0.21,2.1,0.385], color: "amber", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.05,1.1,0.05], pos: [0.42,1.55,0.42], color: "dark", mirror: true, parent: "tourelle" },
      { shape: "tube", radius: 0.025, path: [[0.0,0.98,-0.42],[0.0,1.6,-0.42],[0.0,2.0,-0.4]], color: "copper", parent: "tourelle", fine: true },
    ],
  },
  // beacon : socle étagé de béton à anneau lumineux, quatre contreforts clairs profilés, colonne tournée à bandeau
  // d'équipe, disque lumineux à anneaux, feu tournant (feu) à faisceau et volets ; pièces fines : boulons, câbles
  beacon: {
    parts: [
      ...socle(2),
      { shape: "cylinder", sides: 16, radius: 0.9, height: 0.2, bevel: 0.04, pos: [0,0.35,0], color: "concrete" },
      { shape: "torus", radius: 0.78, tube: 0.025, sides: 16, pos: [0,0.46,0], color: "glow" },
      { shape: "cylinder", sides: 16, radius: 0.75, height: 0.2, bevel: 0.03, pos: [0,0.55,0], color: "light" },
      { shape: "cylinder", sides: 16, radius: 0.55, height: 0.2, pos: [0,0.75,0], color: "steel" },
      { shape: "box", size: [0.1,0.06,0.03], pos: [0.35,0.35,0.85], color: "amber", mirror: true },
      ...[45, 135, 225, 315].map((a): Part => ({ shape: "cylinder", sides: 6, radius: 0.03, height: 0.03, pos: [0.65 * Math.sin((a * Math.PI) / 180),0.66,0.65 * Math.cos((a * Math.PI) / 180)], color: "dark", fine: true })),
      // contreforts profilés
      ...[0, 90, 180, 270].map((a): Part => ({ shape: "extrude", profile: [[-0.72,0.65],[-0.42,0.65],[-0.22,1.45],[-0.3,1.5],[-0.72,0.8]], depth: 0.12, bevel: 0.02, rot: [0,90 + a,0], color: "light" })),
      // colonne tournée
      { shape: "lathe", sides: 12, pos: [0,0,0], color: "light", profile: [[0,0.75],[0.27,0.75],[0.27,0.86],[0.23,0.92],[0.2,2.1],[0.24,2.14],[0,2.16]] },
      { shape: "cylinder", sides: 12, radius: 0.25, height: 0.22, pos: [0,1.9,0], color: "faction" },
      { shape: "cylinder", sides: 12, radius: 0.24, height: 0.08, pos: [0,1.3,0], color: "dark" },
      { shape: "box", size: [0.04,0.5,0.03], pos: [0,1.55,0.225], color: "glow" },
      { shape: "box", size: [0.06,0.05,0.03], pos: [0.12,1.6,0.2], color: "amber", mirror: true },
      { shape: "tube", radius: 0.02, path: [[0.22,0.85,0.0],[0.22,1.25,0.0]], color: "copper", mirror: true, fine: true },
      // disque lumineux à anneaux
      { shape: "lathe", sides: 16, pos: [0,0,0], color: "light", profile: [[0,2.15],[0.32,2.15],[0.62,2.27],[0.68,2.3],[0.62,2.32],[0,2.32]] },
      { shape: "torus", radius: 0.62, tube: 0.025, sides: 16, pos: [0,2.32,0], color: "glow" },
      { shape: "cylinder", sides: 16, radius: 0.48, height: 0.02, pos: [0,2.33,0], color: "dark" },
      { shape: "torus", radius: 0.33, tube: 0.025, sides: 16, pos: [0,2.34,0], color: "glow" },
      // feu (tourne) : globe, faisceau, volets
      { shape: "sphere", radius: 0.16, detail: 1, pos: [0,2.45,0], color: "glow", pivot: "feu" },
      { shape: "cylinder", sides: 8, radius: 0.04, radiusTop: 0.01, height: 0.7, pos: [0,2.85,0], color: "glow", parent: "feu" },
      { shape: "box", size: [0.03,0.24,0.16], pos: [0.19,2.45,0], color: "steel", mirror: true, parent: "feu" },
      { shape: "torus", radius: 0.19, tube: 0.015, sides: 12, pos: [0,2.45,0], color: "steel", parent: "feu", fine: true },
    ],
  },
  // orbital : canon géant tourné incliné à anneaux lumineux et manchons (canon), tourelle d'équipe à pans et joues
  // claires, couronne de béton, coins blindés (toits d'équipe, radômes), bancs de condensateurs ; pièces fines :
  // ailettes du fût, câbles, antennes, boulons
  orbital: {
    parts: [
      ...socle(5),
      ...filets(5),
      { shape: "lathe", sides: 16, pos: [0,0,0], color: "concrete", profile: [[0,0.25],[2.0,0.25],[2.0,0.5],[1.9,0.6],[0,0.6]] },
      { shape: "torus", radius: 1.62, tube: 0.04, sides: 16, pos: [0,0.6,0], color: "steel" },
      ...[0, 45, 90, 135, 180, 225, 270, 315].map((a): Part => ({ shape: "cylinder", sides: 6, radius: 0.04, height: 0.04, pos: [1.82 * Math.sin((a * Math.PI) / 180),0.61,1.82 * Math.cos((a * Math.PI) / 180)], color: "dark", fine: true })),
      { shape: "bevel", size: [0.9,0.8,0.9], pos: [1.9,0.65,1.9], color: "light", mirror: true },
      { shape: "bevel", size: [0.9,0.8,0.9], pos: [1.9,0.65,-1.9], color: "light", mirror: true },
      { shape: "box", size: [0.7,0.1,0.7], pos: [1.9,1.1,1.9], color: "faction", mirror: true },
      { shape: "lathe", sides: 12, pos: [1.9,1.05,-1.9], color: "light", mirror: true, profile: [[0,0],[0.32,0],[0.3,0.1],[0.22,0.2],[0.1,0.26],[0,0.27]] },
      { shape: "box", size: [0.5,0.05,0.03], pos: [1.9,0.75,2.36], color: "glow", mirror: true },
      { shape: "box", size: [0.1,0.06,0.03], pos: [1.9,0.5,2.36], color: "amber", mirror: true },
      // bancs de condensateurs latéraux, bloc arrière, antennes
      { shape: "box", size: [0.6,0.5,1.1], pos: [1.95,0.6,0], color: "dark", mirror: true },
      { shape: "box", size: [0.03,0.05,0.8], pos: [2.26,0.65,0], color: "glow", mirror: true },
      ...[-0.3, 0, 0.3].map((z): Part => ({ shape: "cylinder", sides: 10, radius: 0.1, height: 0.2, pos: [1.95,0.93,z], color: "copper", mirror: true })),
      ...[-0.3, 0, 0.3].map((z): Part => ({ shape: "cylinder", sides: 8, radius: 0.06, height: 0.03, pos: [1.95,1.04,z], color: "light", mirror: true, fine: true })),
      { shape: "box", size: [1.1,0.4,0.5], pos: [0,0.55,-2.05], color: "light" },
      { shape: "box", size: [0.9,0.03,0.3], pos: [0,0.765,-2.05], color: "faction" },
      { shape: "tube", radius: 0.015, sides: 4, path: [[0.9,0.25,-2.1],[0.9,1.15,-2.1]], color: "dark", fine: true },
      { shape: "tube", radius: 0.012, sides: 4, path: [[1.15,0.25,-2.15],[1.15,0.85,-2.15]], color: "dark", fine: true },
      { shape: "sphere", radius: 0.04, pos: [0.9,1.17,-2.1], color: "amber" },
      // tourelle (pivot canon) : couronne, caisse d'équipe à pans, joues claires
      { shape: "cylinder", sides: 16, radius: 1.3, height: 0.3, pos: [0,0.75,0], color: "steel", pivot: "canon" },
      { shape: "torus", radius: 1.3, tube: 0.03, sides: 16, pos: [0,0.82,0], color: "glow", parent: "canon" },
      { shape: "extrude", profile: [[-0.7,-0.75],[0.7,-0.75],[0.75,0.3],[0.5,0.75],[-0.5,0.75],[-0.75,0.3]], depth: 1.1, bevel: 0.06, pos: [0,1.45,-0.35], rot: [90,0,0], color: "faction", parent: "canon" },
      { shape: "bevel", size: [0.3,0.9,1.3], pos: [0.78,1.4,-0.35], color: "light", mirror: true, parent: "canon" },
      { shape: "box", size: [0.1,0.06,0.03], pos: [0.4,1.7,0.41], color: "amber", mirror: true, parent: "canon" },
      { shape: "bevel", size: [0.8,0.3,0.4], pos: [0,2.05,-0.85], bevel: 0.04, color: "dark", parent: "canon" },
      ...[-0.25, 0, 0.25].map((x): Part => ({ shape: "box", size: [0.12,0.03,0.34], pos: [x,2.21,-0.85], color: "black", parent: "canon", fine: true })),
      // fût incliné de 20° vers l'avant : profil tourné, anneaux lumineux, manchon, bouche
      { shape: "lathe", sides: 12, pos: [0,1.803,-0.201], rot: [20,0,0], color: "light", parent: "canon", profile: [[0,0],[0.52,0],[0.52,0.3],[0.48,0.4],[0.44,0.45],[0.44,1.1],[0.47,1.12],[0.47,1.25],[0.41,1.28],[0.4,2.4],[0.43,2.42],[0.43,2.55],[0.37,2.58],[0.36,3.05],[0.42,3.1],[0.42,3.4],[0.3,3.45],[0,3.45]] },
      ...[0.95, 2.0].map((h): Part => ({ shape: "torus", radius: h < 1 ? 0.45 : 0.41, tube: 0.04, sides: 16, pos: [0,1.803 + h * 0.9397,-0.201 + h * 0.342], rot: [20,0,0], color: "glow", parent: "canon" })),
      { shape: "cylinder", sides: 16, radius: 0.45, height: 0.3, pos: [0,1.803 + 1.55 * 0.9397,-0.201 + 1.55 * 0.342], rot: [20,0,0], color: "dark", parent: "canon" },
      { shape: "cylinder", sides: 16, radius: 0.43, height: 0.3, pos: [0,1.803 + 3.22 * 0.9397,-0.201 + 3.22 * 0.342], rot: [20,0,0], color: "dark", parent: "canon" },
      { shape: "cylinder", sides: 16, radius: 0.25, height: 0.04, pos: [0,1.803 + 3.46 * 0.9397,-0.201 + 3.46 * 0.342], rot: [20,0,0], color: "glow", parent: "canon" },
      ...[2.75, 2.85, 2.95].map((h): Part => ({ shape: "torus", radius: 0.38, tube: 0.02, sides: 16, pos: [0,1.803 + h * 0.9397,-0.201 + h * 0.342], rot: [20,0,0], color: "steel", parent: "canon", fine: true })),
      { shape: "box", size: [0.05,2.2,0.04], pos: [0,3.261,0.765], rot: [20,0,0], color: "glow", parent: "canon" },
      { shape: "bevel", size: [0.14,1.8,0.5], pos: [0.42,2.928,0.21], rot: [20,0,0], color: "dark", mirror: true, parent: "canon" },
      { shape: "tube", radius: 0.04, path: [[0.55,1.9,-0.7],[0.55,2.3,-0.45],[0.5,2.6,-0.1]], bend: 0.12, color: "rubber", mirror: true, parent: "canon", fine: true },
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
  // rail (1 x 1) : ballast de béton, trois traverses sombres, deux rails d'acier profilés dans l'axe (+z) ;
  // pièces fines : selles de fixation
  rail: {
    parts: [
      { shape: "extrude", profile: [[-0.45,0],[0.45,0],[0.4,0.05],[-0.4,0.05]], depth: 0.98, color: "concrete" },
      ...[-0.33, 0, 0.33].map((z): Part => ({ shape: "box", size: [0.8,0.06,0.15], pos: [0,0.08,z], color: "dark" })),
      { shape: "extrude", profile: [[-0.035,0],[0.035,0],[0.013,0.05],[0.03,0.08],[-0.03,0.08],[-0.013,0.05]], depth: 1.0, pos: [0.22,0.11,0], color: "steel", mirror: true },
      ...[-0.33, 0, 0.33].map((z): Part => ({ shape: "box", size: [0.12,0.02,0.1], pos: [0.22,0.12,z], color: "metal", mirror: true, fine: true })),
    ],
  },
  // station : gare (3 x 3) — quai de béton à bordure de danger, auvent d'équipe profilé sur poteaux d'acier
  // (verrière, lampes), bâtiment à baies vitrées, conteneurs nervurés sur le toit ; pièces fines : lampes, bancs,
  // nervures, mât à feu
  station: {
    parts: [
      ...socle(3),
      { shape: "bevel", size: [2.8,0.35,1.2], pos: [0,0.35,0.7], bevel: 0.05, color: "concrete" },
      { shape: "box", size: [2.8,0.04,0.2], pos: [0,0.54,1.2], color: "light" },
      { shape: "box", size: [2.8,0.06,0.15], pos: [0,0.55,1.28], color: "hazard" },
      { shape: "box", size: [2.4,0.04,0.03], pos: [0,0.38,1.31], color: "glow" },
      ...[-0.9, 0.9].map((x): Part => ({ shape: "box", size: [0.5,0.1,0.14], pos: [x,0.58,0.75], color: "metal", fine: true })),
      // auvent : poteaux d'acier, toit d'équipe profilé, verrière, lampes
      ...[0.3, 1.15].map((z): Part => ({ shape: "cylinder", sides: 10, radius: 0.06, height: 1.3, pos: [1.25,1.18,z], color: "steel", mirror: true })),
      ...[0.3, 1.15].map((z): Part => ({ shape: "cylinder", sides: 10, radius: 0.09, height: 0.06, bevel: 0.015, pos: [1.25,0.56,z], color: "dark", mirror: true, fine: true })),
      { shape: "extrude", profile: [[-0.62,0],[0.62,0],[0.62,0.06],[0.3,0.2],[-0.3,0.2],[-0.62,0.06]], depth: 2.9, bevel: 0.02, pos: [0,1.8,0.72], rot: [0,90,0], color: "faction" },
      { shape: "box", size: [2.6,0.03,0.4], pos: [0,2.01,0.72], color: "glass" },
      { shape: "box", size: [2.6,0.04,0.03], pos: [0,1.8,1.32], color: "glow" },
      ...[-0.8, 0, 0.8].map((x): Part => ({ shape: "box", size: [0.3,0.03,0.08], pos: [x,1.78,0.72], color: "glow", fine: true })),
      // bâtiment : murs sombres, piliers clairs, baies vitrées, porte, voyants
      { shape: "bevel", size: [2.2,1.0,1.0], pos: [0,0.75,-0.75], color: "dark" },
      { shape: "bevel", size: [0.36,0.9,0.36], pos: [0.95,0.75,-0.4], color: "light", mirror: true },
      { shape: "box", size: [1.4,0.28,0.02], pos: [0,1.0,-0.245], color: "glass" },
      ...[-0.35, 0, 0.35].map((x): Part => ({ shape: "box", size: [0.03,0.28,0.03], pos: [x,1.0,-0.24], color: "dark", fine: true })),
      { shape: "box", size: [0.3,0.15,0.04], pos: [0.45,0.7,-0.24], color: "glow" },
      { shape: "box", size: [0.08,0.06,0.03], pos: [-0.45,0.7,-0.24], color: "amber" },
      { shape: "box", size: [2.1,0.04,0.9], pos: [0,1.27,-0.75], color: "metal" },
      // conteneurs nervurés sur le toit
      { shape: "bevel", size: [0.7,0.5,0.55], pos: [-0.6,1.54,-0.8], bevel: 0.03, color: "hazard" },
      { shape: "bevel", size: [0.7,0.5,0.55], pos: [0.4,1.54,-0.8], bevel: 0.03, color: "faction" },
      ...[-0.85, -0.6, -0.35, 0.15, 0.4, 0.65].map((x): Part => ({ shape: "box", size: [0.03,0.44,0.57], pos: [x,1.54,-0.8], color: x < 0 ? "dark" : "light", fine: true })),
      ...[-0.6, 0.4].map((x): Part => ({ shape: "box", size: [0.6,0.02,0.45], pos: [x,1.8,-0.8], color: "dark", fine: true })),
      // mât à feu
      { shape: "tube", radius: 0.015, sides: 4, path: [[1.2,1.3,-1.1],[1.2,1.95,-1.1]], color: "dark", fine: true },
      { shape: "sphere", radius: 0.045, pos: [1.2,1.97,-1.1], color: "amber" },
    ],
  },
  // cargo_pad : héliport de fret (3 x 3) — aire tournée de béton à anneau cyan et marquage, balises d'angle, petite
  // tour à vigie vitrée et toit d'équipe, réservoir couché sur berceaux, caisses ; pièces fines : feux de bord,
  // tuyau, échelle, antenne
  cargo_pad: {
    parts: [
      ...socle(3),
      ...filets(3),
      { shape: "lathe", sides: 16, pos: [0,0,0.1], color: "concrete", profile: [[0,0.25],[1.25,0.25],[1.25,0.33],[1.2,0.36],[0,0.36]] },
      { shape: "torus", radius: 1.12, tube: 0.025, sides: 16, pos: [0,0.365,0.1], color: "glow" },
      { shape: "cylinder", sides: 12, radius: 1.02, height: 0.02, pos: [0,0.37,0.1], color: "dark", smooth: false },
      { shape: "box", size: [0.15,0.03,1.1], pos: [-0.35,0.39,0.1], color: "light" },
      { shape: "box", size: [0.15,0.03,1.1], pos: [0.35,0.39,0.1], color: "light" },
      { shape: "box", size: [0.7,0.03,0.15], pos: [0,0.39,0.1], color: "light" },
      ...[0, 45, 90, 135, 180, 225, 270, 315].map((a): Part => ({ shape: "box", size: [0.06,0.03,0.06], pos: [1.18 * Math.sin((a * Math.PI) / 180),0.37,0.1 + 1.18 * Math.cos((a * Math.PI) / 180)], color: "amber", fine: true })),
      // balises d'angle
      ...[1.1, -0.9].map((z): Part => ({ shape: "cylinder", sides: 8, radius: 0.08, height: 0.12, pos: [1.1,0.31,z], color: "dark", mirror: true })),
      ...[1.1, -0.9].map((z): Part => ({ shape: "lathe", sides: 8, pos: [1.1,0.37,z], color: "glow", mirror: true, profile: [[0,0],[0.07,0],[0.06,0.08],[0,0.12]] })),
      // tour : fût clair, échelle, vigie vitrée, toit d'équipe, antenne
      { shape: "bevel", size: [0.5,1.3,0.5], pos: [1.1,0.85,-1.15], bevel: 0.05, color: "light" },
      { shape: "box", size: [0.04,1.1,0.03], pos: [0.84,0.85,-1.15], color: "glow" },
      { use: "echelle", pos: [1.1,0.25,-0.89], scale: [1,1.2,1] },
      { shape: "bevel", size: [0.66,0.08,0.66], pos: [1.1,1.48,-1.15], bevel: 0.02, color: "dark" },
      { shape: "box", size: [0.6,0.24,0.6], pos: [1.1,1.64,-1.15], color: "glass" },
      ...[[0.81,-0.86],[1.39,-0.86],[0.81,-1.44],[1.39,-1.44]].map(([x, z]): Part => ({ shape: "box", size: [0.04,0.24,0.04], pos: [x,1.64,z], color: "dark", fine: true })),
      { shape: "bevel", size: [0.68,0.1,0.68], pos: [1.1,1.81,-1.15], bevel: 0.03, color: "faction" },
      { shape: "tube", radius: 0.012, sides: 4, path: [[1.25,1.86,-1.25],[1.25,2.24,-1.25]], color: "dark", fine: true },
      { shape: "box", size: [0.06,0.06,0.06], pos: [1.25,2.27,-1.25], color: "amber" },
      // réservoir de carburant sur berceaux, tuyau vers l'aire
      { shape: "lathe", sides: 12, pos: [-1.35,0.47,-1.15], rot: [0,0,-90], color: "light", profile: [[0,0],[0.14,0],[0.2,0.08],[0.2,0.62],[0.14,0.7],[0,0.7]] },
      { shape: "cylinder", sides: 12, radius: 0.21, height: 0.06, pos: [-1.0,0.47,-1.15], rot: [0,0,90], color: "faction" },
      ...[-1.2, -0.8].map((x): Part => ({ shape: "box", size: [0.08,0.12,0.36], pos: [x,0.31,-1.15], color: "concrete" })),
      { shape: "tube", radius: 0.025, path: [[-0.65,0.47,-1.15],[-0.5,0.3,-1.0],[-0.4,0.3,-0.7]], bend: 0.1, color: "rubber", fine: true },
      // caisses de fret
      { shape: "bevel", size: [0.36,0.3,0.36], pos: [-1.2,0.4,1.15], bevel: 0.03, color: "metal" },
      { shape: "box", size: [0.3,0.02,0.3], pos: [-1.2,0.56,1.15], color: "hazard" },
      { shape: "bevel", size: [0.3,0.22,0.3], pos: [-1.2,0.66,1.15], rot: [0,20,0], bevel: 0.03, color: "faction" },
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
  // gift_portal : portail de don (3 x 3) — arche aux piliers d'équipe profilés, linteau clair, arc et filets
  // lumineux, paquets-cadeaux à rubans d'équipe sur les piliers, plateforme vitrée à anneaux et cœur lumineux ;
  // pièces fines : runes lumineuses, boulons
  gift_portal: {
    parts: [
      ...socle(3),
      ...filets(3),
      { shape: "cylinder", sides: 16, radius: 1.2, height: 0.08, bevel: 0.02, pos: [0,0.29,0], color: "light" },
      { shape: "cylinder", sides: 16, radius: 1.05, height: 0.03, pos: [0,0.34,0], color: "glass" },
      { shape: "torus", radius: 0.9, tube: 0.025, sides: 16, pos: [0,0.355,0], color: "glow" },
      { shape: "cylinder", sides: 12, radius: 0.35, height: 0.04, pos: [0,0.36,0], color: "glow" },
      ...[0, 45, 90, 135, 180, 225, 270, 315].map((a): Part => ({ shape: "box", size: [0.12,0.02,0.04], pos: [0.65 * Math.sin((a * Math.PI) / 180),0.36,0.65 * Math.cos((a * Math.PI) / 180)], rot: [0,a,0], color: "glow", fine: true })),
      // piliers d'équipe profilés, socles clairs, filets
      { shape: "extrude", profile: [[-0.17,0],[0.17,0],[0.14,2.25],[-0.14,2.25]], depth: 0.4, bevel: 0.03, pos: [1.25,0.2,0], color: "faction", mirror: true },
      { shape: "bevel", size: [0.44,0.3,0.5], pos: [1.25,0.4,0], bevel: 0.04, color: "light", mirror: true },
      { shape: "box", size: [0.12,1.9,0.12], pos: [1.08,1.3,0], color: "glow", mirror: true },
      { shape: "box", size: [0.03,1.4,0.03], pos: [1.25,1.4,0.205], color: "glow", mirror: true },
      // linteau, filet, arc lumineux
      { shape: "bevel", size: [2.8,0.3,0.42], pos: [0,2.55,0], bevel: 0.05, color: "light" },
      { shape: "box", size: [2.4,0.06,0.44], pos: [0,2.6,0], color: "faction" },
      { shape: "box", size: [2.2,0.1,0.15], pos: [0,2.3,0], color: "glow" },
      { shape: "torus", radius: 1.08, tube: 0.04, sides: 24, arc: 180, pos: [0,1.2,0], rot: [-90,0,0], color: "glow" },
      ...[[0.9,0.215],[-0.9,0.215]].map(([x, z]): Part => ({ shape: "cylinder", sides: 6, radius: 0.025, height: 0.02, pos: [x,2.55,z], rot: [90,0,0], color: "steel", fine: true })),
      // paquets-cadeaux : boîte claire, rubans d'équipe
      { shape: "bevel", size: [0.5,0.5,0.5], pos: [1.25,2.9,0], bevel: 0.04, color: "light", mirror: true },
      { shape: "box", size: [0.1,0.51,0.5], pos: [1.25,2.9,0], color: "faction", mirror: true },
      { shape: "box", size: [0.5,0.51,0.1], pos: [1.25,2.9,0], color: "faction", mirror: true },
      { shape: "box", size: [0.14,0.02,0.14], pos: [1.25,3.15,0], rot: [0,45,0], color: "amber", mirror: true },
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
