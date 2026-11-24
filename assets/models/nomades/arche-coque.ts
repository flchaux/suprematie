// Coque de l'Arche : encorbellements qui l'élargissent sur toute sa longueur (blindage, briques réactives, flancs
// générateurs du bouclier) et se prolongent sur le gaillard d'avant et sur le bloc arrière quand ils existent.
import type { Part } from "../types.ts";
import { q } from "./commun.ts";
import { ARMES, MOBILITE, groupe } from "./arche-commun.ts";

/** Les trois longueurs d'un encorbellement : flanc de la coque, du gaillard et du bloc arrière (de z0 à z1). */
const ZONES = [
  { nom: "", et: "", z0: -2.28, z1: 2.2 },
  { nom: "_av", et: `&${ARMES}`, z0: 2.2, z1: 3.6 },
  { nom: "_ar", et: `&${MOBILITE}`, z0: -3.46, z1: -2.28 },
];

/** Encorbellement sur ces trois longueurs, une condition chacune. */
function flancs(cond: string, nom: string, f: (z0: number, z1: number) => Part[]): Part[] {
  return ZONES.flatMap((z) => groupe(`si:${cond}${z.et}#fixe_${nom}${z.nom}`, f(z.z0, z.z1)));
}

/** Découpe de z0 à z1 en travées d'environ `pas` : centre et longueur de chacune. */
function travees(z0: number, z1: number, pas: number): { z: number; l: number; k: number }[] {
  const n = Math.max(1, Math.round((z1 - z0) / pas));
  const l = (z1 - z0) / n;
  return Array.from({ length: n }, (_, k) => ({ z: q(z0 + l * (k + 0.5)), l: q(l), k }));
}

/** Plancher d'encorbellement et flasques de ses deux bouts. */
function plancher(z0: number, z1: number, x1: number): Part[] {
  const l = q(z1 - z0);
  const z = q((z0 + z1) / 2);
  return [
    { shape: "box", size: [q(x1 - 1.03), 0.07, l], pos: [q((x1 + 1.03) / 2), 0.93, z], color: "dark", mirror: true },
    { shape: "box", size: [q(x1 - 1.28), 0.46, 0.05], pos: [q((x1 + 1.28) / 2), 0.68, q(z1 - 0.03)], color: "dark", mirror: true, fine: true },
    { shape: "box", size: [q(x1 - 1.28), 0.46, 0.05], pos: [q((x1 + 1.28) / 2), 0.68, q(z0 + 0.03)], color: "dark", mirror: true, fine: true },
  ];
}

/** Blindage : jupes de plaques évasées sur toute la longueur, lisse d'équipe. */
function plaques(z0: number, z1: number): Part[] {
  const l = q(z1 - z0);
  const z = q((z0 + z1) / 2);
  return [
    ...plancher(z0, z1, 1.56),
    ...travees(z0, z1, 1.1).map((t): Part => ({ shape: "bevel", size: [0.1, 0.66, q(t.l - 0.05)], pos: [1.62, 0.66, t.z], rot: [0, 0, 12], bevel: 0.03, color: "rust", mirror: true })),
    ...travees(z0, z1, 1.1).map((t): Part => ({ shape: "box", size: [0.36, 0.08, q(t.l - 0.1)], pos: [1.24, 0.98, t.z], rot: [0, 0, -6], color: "rust", mirror: true })),
    { shape: "box", size: [0.12, 0.08, q(l - 0.02)], pos: [1.52, 0.99, z], color: "faction", mirror: true },
  ];
}

/** Blindage lourd, par-dessus : plaques d'acier épaisses en tuiles, parapet haut. */
function lourdes(z0: number, z1: number): Part[] {
  return [
    ...travees(z0, z1, 1.1).map((t): Part => ({ shape: "bevel", size: [0.2, 0.56, q(t.l - 0.2)], pos: [1.74, 0.62, t.z], rot: [0, 0, 12], bevel: 0.05, color: "steel", mirror: true })),
    ...travees(z0, z1, 1.1).map((t): Part => ({ shape: "box", size: [0.18, 0.5, q(t.l - 0.06)], pos: [1.34, 1.2, t.z], rot: [0, 0, 20], color: "metal", mirror: true })),
    ...travees(z0, z1, 1.1).map((t): Part => ({ shape: "box", size: [0.1, 0.06, q(t.l - 0.3)], pos: [1.27, 1.45, t.z], rot: [0, 0, 20], color: "steel", mirror: true, fine: true })),
    ...travees(z0, z1, 1.1).map((t): Part => ({ shape: "box", size: [0.06, 0.16, 0.16], pos: [1.84, 0.64, t.z], rot: [0, 0, 12], color: "dark", mirror: true, fine: true })),
  ];
}

/** Blindage réactif : flanc à pans, deux rangs de briques explosives en damier. */
function reactif(z0: number, z1: number): Part[] {
  const l = q(z1 - z0);
  const z = q((z0 + z1) / 2);
  const p: Part[] = [{ shape: "extrude", profile: [[1.03, 0.9], [1.03, 0.97], [1.44, 0.97], [1.72, 0.62], [1.64, 0.38], [1.52, 0.38], [1.52, 0.62], [1.36, 0.9]], depth: l, pos: [0, 0, z], color: "dark", mirror: true }];
  for (const t of travees(z0, z1, 0.56)) {
    p.push({ shape: "box", size: [0.32, 0.12, q(t.l - 0.08)], pos: [1.24, 1.02, t.z], color: t.k % 3 === 1 ? "faction" : t.k % 3 ? "rust" : "dry", mirror: true });
    p.push({ shape: "bevel", size: [0.4, 0.14, q(t.l - 0.08)], pos: [1.63, 0.84, t.z], rot: [0, 0, -51], bevel: 0.04, color: t.k % 2 ? "dry" : "metal", mirror: true });
  }
  return p;
}

/** Bouclier : flanc générateur à bobines de cuivre, pylônes à anneau et à tête lumineuse. */
function generateurs(z0: number, z1: number): Part[] {
  const l = q(z1 - z0);
  const z = q((z0 + z1) / 2);
  const oct: [number, number][] = [[0.28, -0.12], [0.28, 0.12], [0.12, 0.28], [-0.12, 0.28], [-0.28, 0.12], [-0.28, -0.12], [-0.12, -0.28], [0.12, -0.28]];
  const p: Part[] = [
    { shape: "extrude", profile: oct, depth: q(l - 0.02), pos: [1.5, 0.8, z], color: "steel", mirror: true },
    { shape: "box", size: [0.3, 0.06, l], pos: [1.18, 0.95, z], color: "dark", mirror: true },
    { shape: "box", size: [0.16, 0.03, q(l - 0.1)], pos: [1.5, 1.085, z], color: "faction", mirror: true },
  ];
  for (const t of travees(z0, z1, 0.9)) p.push({ shape: "cylinder", sides: 8, radius: 0.33, height: 0.13, pos: [1.5, 0.8, t.z], rot: [90, 22.5, 0], color: "copper", mirror: true });
  for (const t of travees(z0, z1, 1.5))
    p.push(
      { shape: "cylinder", sides: 6, radius: 0.08, height: 0.72, pos: [1.5, 1.4, t.z], color: "dark", mirror: true },
      { shape: "torus", radius: 0.2, tube: 0.05, sides: 10, pos: [1.5, 1.46, t.z], color: "copper", mirror: true, fine: true },
      { shape: "sphere", radius: 0.125, pos: [1.5, 1.82, t.z], color: "glow", mirror: true },
    );
  return p;
}

/** Bouclier renforcé, en plus : veine lumineuse le long des flancs, second anneau des pylônes, têtes plus hautes. */
function renfort(z0: number, z1: number): Part[] {
  const l = q(z1 - z0);
  const p: Part[] = [{ shape: "box", size: [0.05, 0.1, q(l - 0.08)], pos: [1.79, 0.8, q((z0 + z1) / 2)], color: "glow", mirror: true }];
  for (const t of travees(z0, z1, 1.5))
    p.push(
      { shape: "torus", radius: 0.29, tube: 0.055, sides: 10, pos: [1.5, 1.28, t.z], color: "copper", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.05, height: 0.4, pos: [1.5, 2.06, t.z], color: "steel", mirror: true },
      { shape: "sphere", radius: 0.085, pos: [1.5, 2.3, t.z], color: "glow", mirror: true },
    );
  return p;
}

/** Grande bulle, en plus : deux arceaux émetteurs par-dessus l'Arche, à nœuds lumineux. */
function arceaux(): Part[] {
  const p: Part[] = [];
  for (const z of [1.22, -1.82]) {
    p.push(
      { shape: "torus", radius: 1.5, tube: 0.085, sides: 16, arc: 180, pos: [0, 1.08, z], rot: [-90, 0, 0], color: "steel" },
      { shape: "box", size: [0.34, 0.3, 0.34], pos: [1.5, 1.14, z], color: "dark", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.2, height: 0.3, pos: [0, 2.58, z], rot: [0, 0, 90], color: "copper" },
      { shape: "sphere", radius: 0.22, pos: [0, 2.82, z], color: "glow" },
    );
    for (const a of [38, 66]) {
      const c = Math.cos((a * Math.PI) / 180);
      const s = Math.sin((a * Math.PI) / 180);
      p.push({ shape: "cylinder", sides: 8, radius: 0.15, height: 0.22, pos: [q(c * 1.5), q(1.08 + s * 1.5), z], rot: [0, 0, a], color: a === 38 ? "copper" : "glow", mirror: true });
    }
  }
  return p;
}

export function coque(): Part[] {
  return [
    ...flancs("ark_plate1+ark_plate2", "plaques", plaques),
    ...flancs("ark_plate2", "lourdes", lourdes),
    ...flancs("ark_reactive", "briques", reactif),
    ...flancs("ark_shield1+ark_shield2+ark_shield3", "bouclier", generateurs),
    ...flancs("ark_shield2+ark_shield3", "renfort", renfort),
    ...groupe("si:ark_shield3#fixe_arceaux", arceaux()),
  ];
}
