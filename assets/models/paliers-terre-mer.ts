// Variantes des paliers supérieurs des Industriels, terre et mer (voir « Paliers des unités » dans
// docs/spec/contenu.md) : char lourd, flak mobile, sous-marin chasseur, croiseur antiaérien.
// Même famille que les versions de base (units.ts : light_tank, mobile_aa, submarine, frigate,
// missile_cruiser), en plus gros, plus blindé, plus armé.
import type { Model, Part, Vec3 } from "./types.ts";

/**
 * Place une pièce le long d'un axe incliné (canon, rampe) : `base` = origine de l'axe, `elev` = angle
 * de hausse en degrés (0 : vers l'avant, +z ; positif : vers le haut), `d` = distance le long de l'axe,
 * `h` = décalage perpendiculaire (vers le haut de l'axe). La rotation de la pièce s'ajoute à la hausse.
 * Pour un cylindre couché dans l'axe, donner rot: [90, 0, 0]. (Copie de l'aide de units.ts.)
 */
function incl(base: Vec3, elev: number, d: number, h: number, p: Part): Part {
  const a = (elev * Math.PI) / 180;
  const s = Math.sin(a);
  const c = Math.cos(a);
  const r = p.rot ?? [0, 0, 0];
  const pos: Vec3 = [base[0], +(base[1] + s * d + c * h).toFixed(3), +(base[2] + c * d - s * h).toFixed(3)];
  return { ...p, pos, rot: [r[0] - elev, r[1], r[2]] };
}

/** Profil (rayon, longueur) d'un fût de canon : culasse, fût, frein de bouche ; `simple` : moins d'arêtes. */
function fut(r: number, l: number, simple = false): [number, number][] {
  const q = (v: number) => +v.toFixed(3);
  if (simple) return [[0, 0], [q(r * 1.5), 0], [q(r), q(l * 0.12)], [q(r), q(l * 0.84)], [q(r * 1.4), q(l * 0.86)], [q(r * 1.4), q(l)], [0, q(l)]];
  return [[0, 0], [q(r * 1.5), 0], [q(r * 1.5), q(l * 0.08)], [q(r), q(l * 0.12)], [q(r), q(l * 0.84)], [q(r * 1.4), q(l * 0.86)], [q(r * 1.4), q(l * 0.98)], [q(r * 1.15), q(l)], [0, q(l)]];
}

/**
 * Paire de roues (axe x, symétriques) de rayon r et de largeur w : pneu tourné à profil réduit, jante d'acier,
 * moyeu fin (moins de triangles que roue_d du kit, pour un porteur à six roues).
 */
function roues(x: number, y: number, z: number, r: number, w: number): Part[] {
  const q = (v: number) => +v.toFixed(3);
  const h = w / 2;
  const profile: [number, number][] = [[q(r * 0.7), q(-h)], [q(r), q(-h * 0.55)], [q(r), q(h * 0.55)], [q(r * 0.7), q(h)]];
  return [
    { shape: "lathe", sides: 8, pos: [x, y, z], rot: [0, 0, 90], color: "rubber", mirror: true, profile },
    { shape: "cylinder", sides: 6, radius: q(r * 0.7), height: q(w * 0.8), pos: [x, y, z], rot: [0, 0, 90], color: "steel", mirror: true, smooth: true },
    { shape: "cylinder", sides: 6, radius: q(r * 0.3), height: q(w * 1.02), pos: [x, y, z], rot: [0, 0, 90], color: "dark", mirror: true, fine: true },
  ];
}

/** Contour de coque vu de dessus (x, z) : poupe arrondie, étrave effilée ; z0 ne garde que l'avant. */
function coque(w: number, zs: number, zb: number, lb: number, z0 = -99): [number, number][] {
  const d: [number, number][] = [[0.78 * w, zs], [0.96 * w, zs + 0.18 * w], [w, zs + 0.5 * w], [w, zb - lb]];
  for (const t of [0.3, 0.55, 0.75, 0.9]) d.push([+(w * (1 - t * t)).toFixed(3), +(zb - lb + lb * t).toFixed(3)]);
  const c = d.filter(([, z]) => z >= z0);
  return [...c, [0, zb], ...c.slice().reverse().map(([x, z]): [number, number] => [-x, z])];
}

// heavy_tank : char lourd de la famille du char léger, chenilles larges couvertes de jupes d'équipe à rail clair,
// caisse massive à glacis incliné plaqué de blindage clair, grosse tourelle à pans claire à dessus d'équipe,
// canon long et épais à évacuateur et frein de bouche, mitrailleuse coaxiale, tourelleau téléopéré ;
// pièces fines : joints des jupes, grilles moteur, lance-fumigènes, antennes
const heavy_tank: Model = {
  parts: [
    { use: "chenille_d", pos: [1.12, 0, 0], scale: [1.22, 1.15, 1.25], mirror: true },
    // caisse basse sombre entre les chenilles, caisse haute d'équipe sur toute la largeur
    { shape: "extrude", profile: [[-1.42, 0.2], [1.2, 0.2], [1.6, 0.56], [-1.5, 0.56]], depth: 1.7, rot: [0, -90, 0], color: "dark" },
    { shape: "extrude", profile: [[-1.5, 0.55], [1.62, 0.55], [1.64, 0.62], [0.95, 0.97], [-1.32, 0.99], [-1.52, 0.76]], depth: 2.6, bevel: 0.05, rot: [0, -90, 0], color: "faction" },
    // jupes latérales d'équipe, rail clair, joints des panneaux
    { shape: "extrude", profile: [[-1.4, 0.24], [1.2, 0.24], [1.44, 0.45], [1.48, 0.6], [-1.48, 0.6], [-1.48, 0.36]], depth: 0.06, bevel: 0.015, pos: [1.41, 0, 0], rot: [0, -90, 0], color: "faction", mirror: true },
    { shape: "box", size: [0.16, 0.07, 2.96], pos: [1.37, 0.635, -0.02], color: "light", mirror: true },
    ...[-0.9, -0.3, 0.3, 0.9].map((z): Part => ({ shape: "box", size: [0.012, 0.3, 0.025], pos: [1.442, 0.43, z], color: "dark", mirror: true, fine: true })),
    // glacis : plaques de blindage clair, poste du pilote, phares, crochets
    incl([0.62, 0.97, 0.95], -26.9, 0.42, 0.03, { shape: "box", size: [0.86, 0.06, 0.58], color: "light", mirror: true }),
    incl([0, 0.97, 0.95], -26.9, 0.16, 0.02, { shape: "box", size: [0.3, 0.05, 0.24], color: "dark" }),
    incl([0, 0.97, 0.95], -26.9, 0.04, 0.05, { shape: "box", size: [0.26, 0.03, 0.04], color: "glass" }),
    { shape: "box", size: [0.16, 0.05, 0.03], pos: [1.0, 0.585, 1.645], color: "amber", mirror: true },
    // plage moteur : capot sombre, grilles, filet cyan, échappements
    { shape: "box", size: [1.9, 0.08, 0.75], pos: [0, 1.01, -0.92], color: "dark" },
    ...[-0.68, -0.82, -0.96, -1.1].map((z): Part => ({ shape: "box", size: [1.4, 0.02, 0.06], pos: [0, 1.055, z], color: "black", fine: true })),
    { shape: "box", size: [1.6, 0.03, 0.04], pos: [0, 1.05, -1.24], color: "glow" },
    // coffres bas sur la caisse arrière, de part et d'autre de la plage moteur (sous la nuque de la tourelle)
    { shape: "box", size: [0.3, 0.07, 0.62], pos: [1.12, 1.02, -0.92], color: "dark", mirror: true },
    { shape: "cylinder", sides: 6, radius: 0.06, height: 0.16, pos: [0.85, 0.82, -1.54], rot: [90, 0, 0], color: "steel", mirror: true },
    // couronne de tourelle
    { shape: "cylinder", sides: 12, radius: 0.66, height: 0.06, pos: [0, 1.0, -0.2], color: "dark" },
    // tourelle à pans (pivot) : corps clair, dessus d'équipe, filets cyan, coffres, nuque sombre
    { shape: "extrude", profile: [[-0.72, -0.8], [0.72, -0.8], [0.84, -0.55], [0.86, 0.15], [0.62, 0.72], [0.3, 0.9], [-0.3, 0.9], [-0.62, 0.72], [-0.86, 0.15], [-0.84, -0.55]], depth: 0.46, bevel: 0.07, pos: [0, 1.25, -0.2], rot: [90, 0, 0], color: "light", pivot: "tourelle" },
    { shape: "extrude", profile: [[-0.72, -0.8], [0.72, -0.8], [0.84, -0.55], [0.86, 0.15], [0.62, 0.72], [0.3, 0.9], [-0.3, 0.9], [-0.62, 0.72], [-0.86, 0.15], [-0.84, -0.55]], depth: 0.06, bevel: 0.02, pos: [0, 1.49, -0.23], rot: [90, 0, 0], scale: [0.82, 0.82, 1], color: "faction", parent: "tourelle" },
    { shape: "box", size: [0.03, 0.04, 0.62], pos: [0.865, 1.3, -0.3], color: "glow", mirror: true, parent: "tourelle" },
    { shape: "box", size: [0.12, 0.24, 0.42], pos: [0.88, 1.2, -0.78], color: "dark", mirror: true, parent: "tourelle" },
    { shape: "bevel", size: [1.3, 0.34, 0.4], pos: [0, 1.24, -1.12], bevel: 0.05, color: "dark", parent: "tourelle" },
    ...[-1.02, -1.12, -1.22].map((z): Part => ({ shape: "box", size: [1.0, 0.015, 0.04], pos: [0, 1.415, z], color: "black", parent: "tourelle", fine: true })),
    { shape: "box", size: [0.08, 0.05, 0.04], pos: [0.5, 1.3, -1.33], color: "amber", mirror: true, parent: "tourelle" },
    // tourelleau du chef à épiscopes et mitrailleuse téléopérée, viseur du tireur, trappe du chargeur
    { shape: "cylinder", sides: 10, radius: 0.18, height: 0.1, pos: [-0.4, 1.57, -0.45], color: "light", parent: "tourelle" },
    { shape: "cylinder", sides: 10, radius: 0.185, height: 0.035, pos: [-0.4, 1.535, -0.45], color: "glass", parent: "tourelle" },
    { shape: "box", size: [0.1, 0.09, 0.2], pos: [-0.4, 1.66, -0.42], color: "dark", parent: "tourelle" },
    { shape: "cylinder", sides: 6, radius: 0.02, height: 0.34, pos: [-0.4, 1.67, -0.15], rot: [90, 0, 0], color: "steel", parent: "tourelle", fine: true },
    { shape: "box", size: [0.22, 0.16, 0.2], pos: [0.42, 1.58, 0.22], color: "dark", parent: "tourelle" },
    { shape: "box", size: [0.16, 0.07, 0.02], pos: [0.42, 1.6, 0.325], color: "glass", parent: "tourelle" },
    { shape: "cylinder", sides: 10, radius: 0.13, height: 0.03, pos: [0.34, 1.535, -0.55], color: "dark", parent: "tourelle", fine: true },
    // masque, canon long et épais : évacuateur de fumées, frein de bouche ; mitrailleuse coaxiale
    { shape: "bevel", size: [0.6, 0.38, 0.3], pos: [0, 1.25, 0.8], bevel: 0.05, color: "dark", parent: "tourelle" },
    { shape: "lathe", sides: 10, pos: [0, 1.25, 0.85], rot: [90, 0, 0], color: "steel", parent: "tourelle", profile: fut(0.1, 1.85) },
    { shape: "cylinder", sides: 10, radius: 0.145, height: 0.3, pos: [0, 1.25, 1.72], rot: [90, 0, 0], color: "steel", parent: "tourelle" },
    { shape: "box", size: [0.26, 0.05, 0.1], pos: [0, 1.25, 2.6], color: "dark", parent: "tourelle", fine: true },
    { shape: "cylinder", sides: 6, radius: 0.028, height: 0.3, pos: [0.22, 1.2, 1.05], rot: [90, 0, 0], color: "steel", parent: "tourelle", fine: true },
    // lance-fumigènes, antennes
    ...[0, 1, 2].map((i): Part => ({ shape: "cylinder", sides: 6, radius: 0.04, height: 0.16, pos: [0.7, 1.45, 0.5 - i * 0.1], rot: [-60, 0, -25], color: "dark", mirror: true, parent: "tourelle", fine: true })),
    { shape: "tube", radius: 0.012, sides: 4, path: [[-0.6, 1.4, -1.2], [-0.6, 2.05, -1.26]], color: "light", parent: "tourelle", fine: true },
    { shape: "tube", radius: 0.012, sides: 4, path: [[0.6, 1.4, -1.2], [0.6, 1.85, -1.24]], color: "light", parent: "tourelle", fine: true },
  ],
};

// flak : la défense antiaérienne mobile en plus lourd, porteur à six roues à garde-boue continu, caisse sombre, cabine
// claire à pare-brise ; couronne d'acier et grosse tourelle d'équipe à deux nacelles claires de deux canons de
// flak relevés à frein de bouche, caisses de munitions ; radar de conduite de tir tournant sur mât arrière ;
// pièces fines : grilles, manchons, cornet du radar, antenne
const flak: Model = {
  parts: [
    ...[0.95, 0.05, -0.85].flatMap((z) => roues(0.86, 0.4, z, 0.4, 0.34)),
    // garde-boue continu au-dessus des trois roues, plié aux deux bouts
    { shape: "extrude", profile: [[-1.32, 0.6], [-1.22, 0.84], [1.26, 0.84], [1.36, 0.6], [1.36, 0.66], [1.29, 0.89], [-1.25, 0.89], [-1.32, 0.66]], depth: 0.38, pos: [0.86, 0, 0], rot: [0, -90, 0], color: "dark", mirror: true },
    // caisse sombre, cabine claire à pare-brise, filets cyan, phares
    { shape: "extrude", profile: [[-1.32, 0.42], [1.25, 0.42], [1.38, 0.62], [1.3, 0.84], [-1.28, 0.86], [-1.36, 0.64]], depth: 1.44, bevel: 0.04, rot: [0, -90, 0], color: "dark" },
    { shape: "extrude", profile: [[0.55, 0.8], [1.32, 0.8], [1.38, 0.9], [1.22, 1.06], [0.57, 1.08]], depth: 1.5, bevel: 0.04, rot: [0, -90, 0], color: "light" },
    { shape: "box", size: [1.1, 0.2, 0.02], pos: [0, 0.985, 1.309], rot: [-45, 0, 0], color: "glass" },
    { shape: "box", size: [0.03, 0.05, 1.9], pos: [0.735, 0.66, -0.05], color: "glow", mirror: true },
    { shape: "box", size: [0.14, 0.06, 0.03], pos: [0.5, 0.72, 1.36], color: "amber", mirror: true },
    { shape: "box", size: [0.08, 0.12, 0.3], pos: [0.74, 0.58, -1.2], color: "hazard", mirror: true, fine: true },
    // plage arrière d'équipe à grilles, socle de couronne
    { shape: "box", size: [1.3, 0.08, 0.6], pos: [0, 0.89, -1.0], color: "faction" },
    ...[-0.82, -0.94, -1.06, -1.18].map((z): Part => ({ shape: "box", size: [0.42, 0.02, 0.05], pos: [0.4, 0.94, z], color: "black", mirror: true, fine: true })),
    { shape: "cylinder", sides: 12, radius: 0.5, height: 0.12, pos: [0, 0.9, -0.15], color: "dark" },
    // radar de conduite de tir : mât arrière, parabole tournante (pivot) et antenne de veille
    { shape: "cylinder", sides: 8, radius: 0.05, height: 0.58, pos: [0, 1.15, -1.2], color: "steel" },
    { shape: "cylinder", sides: 8, radius: 0.07, height: 0.08, pos: [0, 1.46, -1.2], color: "steel", pivot: "radar" },
    { shape: "lathe", sides: 12, pos: [0, 1.56, -1.16], rot: [70, 0, 0], color: "light", parent: "radar", profile: [[0, 0], [0.12, 0.025], [0.24, 0.08], [0.25, 0.1], [0.12, 0.05], [0, 0.03]] },
    { shape: "lathe", sides: 12, pos: [0, 1.56, -1.16], rot: [70, 0, 0], color: "glow", parent: "radar", profile: [[0.255, 0.085], [0.255, 0.105]] },
    { shape: "cylinder", sides: 4, radius: 0.012, height: 0.22, pos: [0, 1.61, -1.02], rot: [70, 0, 0], color: "dark", parent: "radar", fine: true },
    { shape: "box", size: [0.42, 0.1, 0.03], pos: [0, 1.52, -1.27], color: "dark", parent: "radar" },
    // couronne d'acier (pivot) et grosse tourelle à pans
    { shape: "cylinder", sides: 12, radius: 0.56, height: 0.14, bevel: 0.02, pos: [0, 1.02, -0.15], color: "steel", pivot: "tourelle" },
    { shape: "extrude", profile: [[-0.42, -0.55], [0.42, -0.55], [0.5, -0.42], [0.5, 0.28], [0.36, 0.5], [-0.36, 0.5], [-0.5, 0.28], [-0.5, -0.42]], depth: 0.46, bevel: 0.04, pos: [0, 1.32, -0.15], rot: [90, 0, 0], color: "faction", parent: "tourelle" },
    { shape: "box", size: [0.4, 0.06, 0.03], pos: [0, 1.36, 0.365], color: "glow", parent: "tourelle" },
    { shape: "box", size: [0.24, 0.14, 0.24], pos: [-0.14, 1.62, -0.28], color: "dark", parent: "tourelle" },
    { shape: "box", size: [0.18, 0.08, 0.02], pos: [-0.14, 1.63, -0.155], color: "glass", parent: "tourelle" },
    { shape: "box", size: [0.07, 0.05, 0.05], pos: [0.2, 1.57, -0.4], color: "amber", parent: "tourelle" },
    { shape: "tube", radius: 0.012, sides: 4, path: [[0.24, 1.55, -0.55], [0.24, 2.1, -0.6]], color: "light", parent: "tourelle", fine: true },
    // tourillons, nacelles relevées, caisses de munitions
    { shape: "cylinder", sides: 6, radius: 0.09, height: 0.42, pos: [0.655, 1.4, -0.15], rot: [0, 0, 90], color: "steel", mirror: true, parent: "tourelle" },
    incl([0.66, 1.4, -0.15], 70, 0, 0, { shape: "box", size: [0.3, 0.38, 0.9], color: "light", mirror: true, parent: "tourelle" }),
    incl([0.66, 1.4, -0.15], 70, 0.05, 0.195, { shape: "box", size: [0.22, 0.02, 0.6], color: "faction", mirror: true, parent: "tourelle" }),
    incl([0.85, 1.4, -0.15], 70, -0.08, -0.02, { shape: "box", size: [0.1, 0.28, 0.52], color: "dark", mirror: true, parent: "tourelle" }),
    // quatre canons de flak : fût d'acier à frein de bouche (fin ; au loin, un tube simple), manchon de recul
    ...[0.585, 0.735].flatMap((x): Part[] => [
      incl([x, 1.4, -0.15], 70, 0.3, 0.06, { shape: "lathe", sides: 6, rot: [90, 0, 0], color: "steel", mirror: true, parent: "tourelle", fine: true, profile: fut(0.052, 1.55, true) }),
      incl([x, 1.4, -0.15], 70, 1.075, 0.06, { shape: "cylinder", sides: 5, radius: 0.046, height: 1.55, rot: [90, 0, 0], color: "steel", mirror: true, parent: "tourelle" }),
      incl([x, 1.4, -0.15], 70, 0.56, 0.06, { shape: "cylinder", sides: 8, radius: 0.072, height: 0.24, rot: [90, 0, 0], color: "steel", mirror: true, parent: "tourelle", fine: true }),
    ]),
  ],
};

// hunter_sub : le sous-marin en plus long et plus fin, coque fuselée sombre, proue claire en dôme de sonar à anneau
// cyan, pont d'équipe, kiosque profilé à toit clair et filets cyan, quatre tubes lance-torpilles sur les flancs de
// la proue, barres de plongée avant, gouvernes en croix (X) à l'arrière, hélice carénée (pivot) dans sa tuyère ;
// pièces fines : périscopes, mâts, trappes, bagues des tubes
const hunter_sub: Model = {
  parts: [
    { shape: "lathe", sides: 16, pos: [0, 0.42, 0], rot: [90, 0, 0], scale: [1, 1, 0.82], color: "dark", profile: [[0, -2.95], [0.06, -2.88], [0.14, -2.6], [0.27, -2.1], [0.41, -1.35], [0.49, -0.6], [0.5, -0.1], [0.5, 1.55], [0.482, 1.95], [0, 1.95]] },
    { shape: "lathe", sides: 16, pos: [0, 0.42, 0], rot: [90, 0, 0], scale: [1, 1, 0.82], color: "light", profile: [[0, 1.93], [0.483, 1.93], [0.45, 2.25], [0.36, 2.52], [0.2, 2.72], [0, 2.8]] },
    { shape: "lathe", sides: 16, pos: [0, 0.42, 0], rot: [90, 0, 0], scale: [1, 1, 0.82], color: "glow", profile: [[0.488, 1.89], [0.488, 1.96]] },
    { shape: "box", size: [0.012, 0.03, 1.9], pos: [0.505, 0.42, 0.55], color: "glow", mirror: true },
    // pont d'équipe, trappes
    { shape: "extrude", profile: [[-0.1, -1.15], [0.1, -1.15], [0.2, -0.6], [0.2, 1.3], [0.12, 1.75], [-0.12, 1.75], [-0.2, 1.3], [-0.2, -0.6]], depth: 0.08, bevel: 0.02, pos: [0, 0.8, 0], rot: [90, 0, 0], color: "faction" },
    ...[-0.55, -0.85].map((z): Part => ({ shape: "cylinder", sides: 10, radius: 0.06, height: 0.03, pos: [0, 0.845, z], color: "steel", fine: true })),
    { shape: "cylinder", sides: 10, radius: 0.06, height: 0.03, pos: [0, 0.845, 1.6], color: "amber" },
    // kiosque profilé : congé à la base, toit clair, filets cyan, périscopes et mâts
    { shape: "extrude", profile: [[0, 0.6], [0.08, 0.52], [0.125, 0.35], [0.135, 0.08], [0.115, -0.22], [0.06, -0.42], [0, -0.5], [-0.06, -0.42], [-0.115, -0.22], [-0.135, 0.08], [-0.125, 0.35], [-0.08, 0.52]], depth: 0.5, bevel: 0.03, pos: [0, 1.05, 0.9], rot: [90, 0, 0], color: "dark" },
    { shape: "extrude", profile: [[0, 0.6], [0.08, 0.52], [0.125, 0.35], [0.135, 0.08], [0.115, -0.22], [0.06, -0.42], [0, -0.5], [-0.06, -0.42], [-0.115, -0.22], [-0.135, 0.08], [-0.125, 0.35], [-0.08, 0.52]], depth: 0.1, bevel: 0.03, pos: [0, 0.84, 0.9], rot: [90, 0, 0], scale: [1.5, 1.2, 1], color: "dark" },
    { shape: "extrude", profile: [[0, 0.6], [0.08, 0.52], [0.125, 0.35], [0.135, 0.08], [0.115, -0.22], [0.06, -0.42], [0, -0.5], [-0.06, -0.42], [-0.115, -0.22], [-0.135, 0.08], [-0.125, 0.35], [-0.08, 0.52]], depth: 0.04, pos: [0, 1.31, 0.9], rot: [90, 0, 0], scale: [0.92, 0.95, 1], color: "light" },
    { shape: "box", size: [0.02, 0.04, 0.42], pos: [0.137, 1.2, 1.0], color: "glow", mirror: true },
    { shape: "cylinder", sides: 6, radius: 0.025, height: 0.3, pos: [0.035, 1.46, 1.15], color: "steel", mirror: true },
    { shape: "cylinder", sides: 6, radius: 0.038, height: 0.05, pos: [0.035, 1.61, 1.15], color: "dark", mirror: true, fine: true },
    { shape: "box", size: [0.04, 0.22, 0.08], pos: [0, 1.42, 0.75], color: "metal", fine: true },
    { shape: "sphere", radius: 0.035, pos: [0, 1.55, 0.75], color: "amber" },
    // tubes lance-torpilles sur les flancs de la proue (bouches sombres, bagues d'acier)
    ...[[0.46, 0.57], [0.47, 0.3]].flatMap(([x, y]): Part[] => [
      { shape: "cylinder", sides: 6, radius: 0.045, height: 0.55, pos: [x, y, 1.88], rot: [90, 0, 0], color: "steel", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.034, height: 0.02, pos: [x, y, 2.156], rot: [90, 0, 0], color: "black", mirror: true, fine: true },
      { shape: "torus", radius: 0.045, tube: 0.01, sides: 8, pos: [x, y, 2.15], rot: [90, 0, 0], color: "dark", mirror: true, fine: true },
    ]),
    // barres de plongée avant
    { shape: "extrude", profile: [[0.45, 1.65], [0.68, 1.55], [0.68, 1.45], [0.45, 1.42]], depth: 0.03, bevel: 0.008, pos: [0, 0.55, 0], rot: [90, 0, 0], color: "dark", mirror: true },
    // gouvernes en X : hautes d'équipe, basses sombres
    { shape: "extrude", profile: [[-2.25, 0], [-2.62, 0.66], [-2.84, 0.66], [-2.92, 0]], depth: 0.035, bevel: 0.01, pos: [0, 0.42, 0], rot: [90, -45, 90], color: "faction", mirror: true },
    { shape: "extrude", profile: [[-2.25, 0], [-2.92, 0], [-2.84, -0.6], [-2.62, -0.6]], depth: 0.035, bevel: 0.01, pos: [0, 0.42, 0], rot: [90, -45, 90], color: "dark", mirror: true },
    // tuyère de l'hélice carénée et hélice (pivot : moyeu, pales, feu)
    { shape: "lathe", sides: 12, pos: [0, 0.42, -2.98], rot: [90, 0, 0], color: "dark", profile: [[0.2, -0.14], [0.235, -0.12], [0.255, 0.0], [0.24, 0.1], [0.21, 0.13], [0.2, 0.0]] },
    { shape: "sphere", radius: 0.075, pos: [0, 0.42, -3.04], color: "steel", pivot: "helice" },
    { shape: "box", size: [0.014, 0.36, 0.07], pos: [0, 0.42, -3.04], rot: [0, 25, 0], color: "light", parent: "helice" },
    { shape: "sphere", radius: 0.035, pos: [0, 0.42, -3.11], color: "glow", parent: "helice" },
  ],
};

// aa_cruiser : coque de croiseur sombre à listeau clair et filet cyan, plage avant d'équipe ; canon avant (pivot),
// lanceur double à rampes de missiles surface-air (pivot) sur barbette, lanceurs verticaux avant (une trappe ambre)
// et arrière, château clair à quatre panneaux radar fixes aux coins, passerelle vitrée, mât à antenne radar plate
// tournante (pivot), cheminée, rampes inclinées de missiles de part et d'autre, rouf arrière à mât et parabole
// tournante (pivot) ; pièces fines : trappes, faces vitrées des panneaux, rambardes, ailerons, canots, haubans
const aa_cruiser: Model = (() => {
  const caisse: [number, number][] = [[-0.24, -0.24], [0.24, -0.24], [0.27, 0.06], [0.13, 0.25], [-0.13, 0.25], [-0.27, 0.06]];
  const chateau: [number, number][] = [[-0.42, -1.15], [0.42, -1.15], [0.62, -0.95], [0.62, -0.05], [0.37, 0.2], [-0.37, 0.2], [-0.62, -0.05], [-0.62, -0.95]];
  // rampe et missile surface-air du lanceur double (côté droit, symétrique) : corps clair, ogive rouge, ailerons
  const rb: Vec3 = [0.22, 1.02, 1.1];
  const re = 20;
  // trappes des lanceurs verticaux avant : une ambre (non fine), les autres fines
  const cellules: Part[] = [];
  for (const z of [0.38, 0.62]) {
    for (const x of [0.13, 0.38]) {
      if (z === 0.62 && x === 0.38) {
        cellules.push({ shape: "box", size: [0.2, 0.03, 0.2], pos: [x, 0.765, z], color: "amber" });
        cellules.push({ shape: "box", size: [0.2, 0.03, 0.2], pos: [-x, 0.765, z], color: "steel", fine: true });
      } else cellules.push({ shape: "box", size: [0.2, 0.03, 0.2], pos: [x, 0.765, z], color: "steel", mirror: true, fine: true });
    }
  }
  return {
    parts: [
      // coque, listeau, filet de flottaison, pont, plage avant, bandes d'équipe, rambardes
      { shape: "extrude", profile: coque(0.86, -2.85, 3.15, 1.85), depth: 0.56, bevel: 0.06, pos: [0, 0.3, 0], rot: [90, 0, 0], color: "dark" },
      { shape: "extrude", profile: coque(0.895, -2.87, 3.17, 1.85), depth: 0.05, pos: [0, 0.5, 0], rot: [90, 0, 0], color: "light" },
      { shape: "extrude", profile: coque(0.875, -2.86, 3.16, 1.85), depth: 0.03, pos: [0, 0.24, 0], rot: [90, 0, 0], color: "glow" },
      { shape: "extrude", profile: coque(0.81, -2.8, 3.03, 1.75), depth: 0.04, pos: [0, 0.6, 0], rot: [90, 0, 0], color: "metal" },
      { shape: "extrude", profile: coque(0.81, -2.8, 3.03, 1.75, 1.3), depth: 0.012, pos: [0, 0.624, 0], rot: [90, 0, 0], color: "faction" },
      { shape: "box", size: [0.14, 0.012, 3.4], pos: [0.7, 0.626, -0.9], color: "faction", mirror: true, fine: true },
      { shape: "box", size: [0.014, 0.014, 3.9], pos: [0.79, 0.68, -0.65], color: "light", mirror: true, fine: true },
      { shape: "box", size: [0.08, 0.04, 0.12], pos: [0.14, 0.645, 2.75], color: "dark", mirror: true, fine: true },
      // canon avant (pivot) : couronne, caisse à pans, toit d'équipe, tube
      { shape: "cylinder", sides: 12, radius: 0.3, height: 0.08, bevel: 0.015, pos: [0, 0.66, 2.3], color: "steel", pivot: "tourelle" },
      { shape: "extrude", profile: caisse, depth: 0.22, bevel: 0.035, pos: [0, 0.81, 2.28], rot: [90, 0, 0], color: "light", parent: "tourelle" },
      { shape: "extrude", profile: caisse, depth: 0.03, pos: [0, 0.935, 2.27], rot: [90, 0, 0], scale: [0.76, 0.76, 1], color: "faction", parent: "tourelle" },
      { shape: "box", size: [0.12, 0.035, 0.03], pos: [0, 0.87, 2.535], color: "glow", parent: "tourelle", fine: true },
      { shape: "lathe", sides: 8, pos: [0, 0.83, 2.5], rot: [90, 0, 0], color: "steel", parent: "tourelle", profile: [[0, 0], [0.055, 0], [0.038, 0.15], [0.038, 0.62], [0, 0.62]] },
      { shape: "cylinder", sides: 8, radius: 0.05, height: 0.06, pos: [0, 0.83, 3.09], rot: [90, 0, 0], color: "dark", parent: "tourelle", fine: true },
      // lanceur double de missiles surface-air (pivot) sur barbette : socle, bras, rampes, missiles
      { shape: "cylinder", sides: 12, radius: 0.3, height: 0.16, pos: [0, 0.7, 1.1], color: "dark" },
      { shape: "cylinder", sides: 12, radius: 0.26, height: 0.06, pos: [0, 0.81, 1.1], color: "steel", pivot: "lanceur" },
      { shape: "box", size: [0.26, 0.26, 0.32], pos: [0, 0.96, 1.07], color: "light", parent: "lanceur" },
      { shape: "box", size: [0.2, 0.03, 0.03], pos: [0, 1.0, 1.235], color: "glow", parent: "lanceur", fine: true },
      { shape: "cylinder", sides: 6, radius: 0.055, height: 0.5, pos: [0, 1.02, 1.1], rot: [0, 0, 90], color: "steel", parent: "lanceur" },
      incl(rb, re, 0.15, 0, { shape: "box", size: [0.07, 0.07, 0.9], color: "dark", mirror: true, parent: "lanceur" }),
      incl(rb, re, -0.22, 0.11, { shape: "lathe", sides: 8, rot: [90, 0, 0], color: "light", mirror: true, parent: "lanceur", profile: [[0, 0], [0.065, 0], [0.065, 0.66], [0, 0.66]] }),
      incl(rb, re, 0.53, 0.11, { shape: "cone", sides: 6, radius: 0.065, height: 0.18, rot: [90, 0, 0], color: "red", mirror: true, parent: "lanceur" }),
      incl(rb, re, -0.14, 0.11, { shape: "box", size: [0.24, 0.014, 0.12], color: "light", mirror: true, parent: "lanceur", fine: true }),
      incl(rb, re, -0.14, 0.11, { shape: "box", size: [0.014, 0.24, 0.12], color: "light", mirror: true, parent: "lanceur", fine: true }),
      // lanceurs verticaux avant : 4 x 2 trappes (une ambre)
      { shape: "box", size: [1.0, 0.16, 0.5], pos: [0, 0.68, 0.5], color: "dark" },
      ...cellules,
      { shape: "box", size: [0.03, 0.02, 0.44], pos: [0, 0.77, 0.5], color: "glow", fine: true },
      // château clair, panneaux radar fixes aux quatre coins (faces vitrées octogonales : pièces fines)
      { shape: "extrude", profile: chateau, depth: 0.52, bevel: 0.04, pos: [0, 0.88, 0], rot: [90, 0, 0], color: "light" },
      { shape: "box", size: [0.3, 0.3, 0.03], pos: [0.508, 0.9, 0.088], rot: [0, 45, 0], color: "dark", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.12, height: 0.01, pos: [0.522, 0.9, 0.102], rot: [90, 0, -45], color: "glass", mirror: true, fine: true },
      { shape: "box", size: [0.24, 0.24, 0.03], pos: [0.533, 0.9, -1.063], rot: [0, -45, 0], color: "dark", mirror: true, fine: true },
      { shape: "cylinder", sides: 8, radius: 0.09, height: 0.01, pos: [0.547, 0.9, -1.077], rot: [90, 0, -135], color: "glass", mirror: true, fine: true },
      { shape: "box", size: [0.08, 0.05, 0.04], pos: [0.26, 1.05, 0.21], color: "amber", mirror: true, fine: true },
      // passerelle sombre, vitrage cyan, toit clair
      { shape: "extrude", profile: [[-0.45, -0.75], [0.45, -0.75], [0.45, -0.1], [0.3, 0.08], [-0.3, 0.08], [-0.45, -0.1]], depth: 0.3, bevel: 0.03, pos: [0, 1.29, 0], rot: [90, 0, 0], color: "dark" },
      { shape: "box", size: [0.5, 0.06, 0.03], pos: [0, 1.33, 0.085], color: "glow" },
      { shape: "box", size: [0.03, 0.06, 0.2], pos: [0.38, 1.33, -0.01], rot: [0, -50, 0], color: "glow", mirror: true, fine: true },
      { shape: "box", size: [0.72, 0.03, 0.62], pos: [0, 1.455, -0.44], color: "light" },
      // mât tripode et antenne radar plate tournante (pivot)
      { shape: "cylinder", sides: 6, radius: 0.06, height: 0.72, pos: [0, 1.82, -0.5], color: "steel" },
      { shape: "tube", radius: 0.022, sides: 4, path: [[0.25, 1.47, -0.72], [0, 1.95, -0.52]], color: "steel", mirror: true, fine: true },
      { shape: "box", size: [0.55, 0.03, 0.05], pos: [0, 1.98, -0.5], color: "steel", fine: true },
      { shape: "cylinder", sides: 6, radius: 0.07, height: 0.1, pos: [0, 2.2, -0.5], color: "steel", pivot: "radar" },
      { shape: "box", size: [0.9, 0.24, 0.05], pos: [0, 2.37, -0.5], color: "dark", parent: "radar" },
      { shape: "box", size: [0.94, 0.035, 0.08], pos: [0, 2.24, -0.5], color: "light", parent: "radar" },
      { shape: "box", size: [0.94, 0.035, 0.08], pos: [0, 2.5, -0.5], color: "light", parent: "radar", fine: true },
      { shape: "box", size: [0.86, 0.025, 0.06], pos: [0, 2.37, -0.5], color: "glow", parent: "radar" },
      // cheminée, rampes inclinées de missiles de part et d'autre
      { shape: "extrude", profile: [[-0.2, -1.7], [0.2, -1.7], [0.26, -1.5], [0.22, -1.25], [-0.22, -1.25], [-0.26, -1.5]], depth: 0.7, bevel: 0.03, pos: [0, 0.97, 0], rot: [90, 0, 0], color: "dark" },
      { shape: "extrude", profile: [[-0.16, -1.66], [0.16, -1.66], [0.21, -1.5], [0.18, -1.29], [-0.18, -1.29], [-0.21, -1.5]], depth: 0.02, pos: [0, 1.325, 0], rot: [90, 0, 0], color: "black", fine: true },
      { shape: "box", size: [0.4, 0.03, 0.03], pos: [0, 1.16, -1.245], color: "glow", fine: true },
      { shape: "box", size: [0.3, 0.1, 0.5], pos: [0.5, 0.67, -1.5], color: "dark", mirror: true, fine: true },
      incl([0.5, 0.72, -1.72], 30, 0.3, 0.14, { shape: "box", size: [0.28, 0.28, 0.62], color: "light", mirror: true }),
      incl([0.5, 0.72, -1.72], 30, 0.615, 0.14, { shape: "box", size: [0.24, 0.24, 0.02], color: "red", mirror: true }),
      incl([0.5, 0.72, -1.72], 30, 0.63, 0.14, { shape: "box", size: [0.24, 0.015, 0.012], color: "dark", mirror: true, fine: true }),
      incl([0.5, 0.72, -1.72], 30, 0.63, 0.14, { shape: "box", size: [0.015, 0.24, 0.012], color: "dark", mirror: true, fine: true }),
      // canots
      { shape: "lathe", sides: 8, pos: [0.71, 0.74, -0.7], rot: [90, 0, 0], scale: [1, 1, 0.7], color: "light", mirror: true, fine: true, profile: [[0, -0.22], [0.055, -0.19], [0.07, 0.0], [0.055, 0.18], [0, 0.22]] },
      // rouf arrière, mât et parabole tournante (pivot)
      { shape: "extrude", profile: [[-0.4, -2.3], [0.4, -2.3], [0.45, -2.2], [0.45, -1.85], [0.35, -1.75], [-0.35, -1.75], [-0.45, -1.85], [-0.45, -2.2]], depth: 0.4, bevel: 0.03, pos: [0, 0.82, 0], rot: [90, 0, 0], color: "light" },
      { shape: "box", size: [0.5, 0.012, 0.4], pos: [0, 1.026, -2.05], color: "faction" },
      { shape: "cylinder", sides: 6, radius: 0.045, height: 0.46, pos: [0, 1.25, -2.0], color: "steel" },
      { shape: "cylinder", sides: 6, radius: 0.055, height: 0.06, pos: [0, 1.5, -2.0], color: "steel", pivot: "radar_ar" },
      { shape: "lathe", sides: 10, pos: [0, 1.6, -1.97], rot: [72, 0, 0], color: "light", parent: "radar_ar", profile: [[0, 0], [0.1, 0.02], [0.2, 0.065], [0.21, 0.085], [0.1, 0.04], [0, 0.025]] },
      { shape: "cylinder", sides: 4, radius: 0.01, height: 0.18, pos: [0, 1.63, -1.87], rot: [72, 0, 0], color: "dark", parent: "radar_ar", fine: true },
      { shape: "sphere", radius: 0.025, pos: [0, 1.655, -1.79], color: "glow", parent: "radar_ar", fine: true },
      // lanceurs verticaux arrière : 4 x 2 trappes rouges (fines)
      { shape: "box", size: [0.8, 0.14, 0.36], pos: [0, 0.67, -2.55], color: "dark" },
      ...[-2.47, -2.63].flatMap((z): Part[] => [0.1, 0.3].map((x): Part => ({ shape: "box", size: [0.16, 0.03, 0.13], pos: [x, 0.745, z], color: "red", mirror: true, fine: true }))),
    ],
  };
})();

export const PALIERS_TERRE_MER: Record<string, Model> = { heavy_tank, flak, hunter_sub, aa_cruiser };
