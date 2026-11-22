// Pièces communes des Transhumants (chenilles, bâches, coffres, châssis des chariots) : voir transhumants.ts
// et les gréements des modules dans ce dossier.
import type { Part, Vec3 } from "../types.ts";
import { stade } from "../kit.ts";

export type C = Part["color"];
export const q = (v: number) => +v.toFixed(3);

/** Contour en demi-ellipse (largeur 2 x rx, hauteur ry) posé sur y = 0, à extruder le long de z (bâche, voûte). */
export function voute(rx: number, ry: number, n = 8): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI;
    out.push([q(Math.cos(a) * rx), q(Math.sin(a) * ry)]);
  }
  return out;
}

/** Arceau : demi-ellipse d'épaisseur `ep` (nervure, bande de bâche). */
export function arceau(rx: number, ry: number, ep: number, n = 8): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI;
    out.push([q(Math.cos(a) * rx), q(Math.sin(a) * ry)]);
  }
  for (let i = n; i >= 0; i--) {
    const a = (i / n) * Math.PI;
    out.push([q(Math.cos(a) * (rx - ep)), q(Math.sin(a) * (ry - ep))]);
  }
  return out;
}

/** Tracé d'une hélice d'axe y (filet de vrille), centrée en (cx, cz). */
export function heliceY(cx: number, cz: number, r: number, y0: number, y1: number, tours: number, n: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * tours * 2 * Math.PI;
    out.push([q(cx + Math.cos(a) * r), q(y0 + (y1 - y0) * t), q(cz + Math.sin(a) * r)]);
  }
  return out;
}

/**
 * Place une pièce le long d'un axe incliné (canon) : `base` = origine, `elev` = hausse en degrés (0 : vers +z),
 * `d` = distance le long de l'axe, `h` = décalage perpendiculaire. Un cylindre couché dans l'axe prend rot: [90, 0, 0].
 */
export function incl(base: Vec3, elev: number, d: number, h: number, p: Part): Part {
  const a = (elev * Math.PI) / 180;
  const s = Math.sin(a);
  const c = Math.cos(a);
  const r = p.rot ?? [0, 0, 0];
  return { ...p, pos: [base[0], q(base[1] + s * d + c * h), q(base[2] + c * d - s * h)], rot: [r[0] - elev, r[1], r[2]] };
}

/** Profil (rayon, longueur) d'un fût de canon : culasse, fût, manchon, frein de bouche. */
export function fut(r: number, l: number): [number, number][] {
  return [[0, 0], [q(r * 1.6), 0], [q(r * 1.6), q(l * 0.1)], [q(r * 1.1), q(l * 0.14)], [q(r), q(l * 0.5)], [q(r * 1.25), q(l * 0.52)], [q(r * 1.25), q(l * 0.6)], [q(r), q(l * 0.62)], [q(r * 0.9), q(l * 0.88)], [q(r * 1.5), q(l * 0.9)], [q(r * 1.5), q(l)], [0, q(l)]];
}

/**
 * Large chenille de caoutchouc (paire symétrique en ±x) : bande en stade, flasque sombre, barbotin et roue folle
 * d'acier, galets et crampons du brin supérieur tous les `pas` (pièces fines ; `pas` = 0 : ni galets ni crampons). Longueur l (z), hauteur h, largeur w,
 * posée à y0, centrée en z. `roule` (unités) : les crampons forment le pivot « chenille_p<pas> », que le jeu fait
 * glisser vers l'avant quand l'unité roule (voir render/entities.ts).
 */
export function chenille(x: number, l: number, h: number, w: number, y0 = 0, z = 0, pas = 0.25, roule = false): Part[] {
  const y = q(y0 + h / 2);
  const p: Part[] = [
    { shape: "extrude", profile: stade(l, h, 4), depth: w, bevel: 0.03, pos: [x, y, z], rot: [0, -90, 0], color: "rubber", mirror: true },
    { shape: "extrude", profile: stade(q(l - 0.14), q(h * 0.6), 3), depth: q(w + 0.03), pos: [x, y, z], rot: [0, -90, 0], color: "dark", mirror: true, fine: true },
    { shape: "cylinder", sides: 8, radius: q(h * 0.36), height: q(w + 0.05), pos: [x, y, q(z + l / 2 - h / 2)], rot: [0, 0, 90], color: "steel", mirror: true, fine: true },
    { shape: "cylinder", sides: 8, radius: q(h * 0.33), height: q(w + 0.05), pos: [x, y, q(z - l / 2 + h / 2)], rot: [0, 0, 90], color: "steel", mirror: true, fine: true },
  ];
  if (pas <= 0) return p;
  const n = Math.max(2, Math.round((l - 2 * h) / (h * 0.75)));
  for (let i = 0; i < n; i++) {
    const zz = q(z - l / 2 + h + ((l - 2 * h) * (i + 0.5)) / n);
    p.push({ shape: "cylinder", sides: 6, radius: q(h * 0.24), height: q(w + 0.04), pos: [x, q(y0 + h * 0.3), zz], rot: [0, 0, 90], color: "metal", mirror: true, fine: true });
  }
  // crampons du brin supérieur (régulièrement espacés : un glissement d'un pas les ramène en place)
  const nc = Math.max(3, Math.round((l - h) / pas));
  const tag: Partial<Part> = roule ? { pivot: `chenille_p${q((l - h) / nc)}` } : {};
  for (let i = 0; i < nc; i++) {
    const zz = q(z - (l - h) / 2 + ((l - h) * (i + 0.5)) / nc);
    p.push({ shape: "box", size: [q(w + 0.01), 0.025, 0.05], pos: [x, q(y0 + h + 0.005), zz], color: "dark", mirror: true, fine: true, ...tag });
  }
  return p;
}

/** Caisse ou coffre de bois (ou de tôle) ceinturé de deux sangles sombres. */
export function coffre(pos: Vec3, size: Vec3, color: C = "wood", sangle: C = "black"): Part[] {
  const [x, y, z] = pos;
  return [
    { shape: "box", size, pos, color },
    { shape: "box", size: [q(size[0] + 0.012), q(size[1] + 0.012), 0.035], pos: [x, y, q(z + size[2] * 0.27)], color: sangle, fine: true },
    { shape: "box", size: [q(size[0] + 0.012), q(size[1] + 0.012), 0.035], pos: [x, y, q(z - size[2] * 0.27)], color: sangle, fine: true },
  ];
}

/**
 * Bâche sur arceaux (axe z) : voûte de toile de demi-largeur rx, de hauteur ry et de longueur l posée en (x, y, z),
 * des bandes d'équipe et, si `aretes`, des arceaux d'acier (pièces fines) aux extrémités.
 */
export function bache(x: number, y: number, z: number, rx: number, ry: number, l: number, color: C = "dry", bandes = 2, aretes = true): Part[] {
  const p: Part[] = [{ shape: "extrude", profile: voute(rx, ry), depth: l, pos: [x, y, z], color }];
  for (let i = 0; i < bandes; i++) {
    const zz = q(z - l / 2 + (l * (i + 0.5)) / bandes);
    p.push({ shape: "extrude", profile: arceau(q(rx + 0.045), q(ry + 0.045), 0.06, 6), depth: q(Math.min(0.14, l * 0.16)), pos: [x, y, zz], color: "faction" });
  }
  for (const s of aretes ? [1, -1] : []) {
    p.push({ shape: "extrude", profile: arceau(q(rx + 0.015), q(ry + 0.015), 0.035), depth: 0.04, pos: [x, y, q(z + (s * (l - 0.04)) / 2)], color: "metal", fine: true });
  }
  return p;
}

// ——— Modules repliés (chargements des chenillards et pièces communes aux modules déployés) ———

/**
 * Châssis d'un chariot des Transhumants (unité repliée et module déployé : même géométrie) : deux larges chenilles,
 * cadre, plateau de tôle (dessus à y = 0,575, |x| < w/2 + 0,18, z de -l/2 + 0,06 à l/2 - 0,1), jupes d'équipe,
 * garde-boue, cabine à l'avant gauche (|x| de w/2 - 0,47 à w/2 + 0,13, z au-delà de l/2 - 0,59) avec phares,
 * et quatre stabilisateurs aux z `zs` (bras coulissants, fourreau, vérin, patin au sol en pose déployée).
 * Avec `chariot` (unité) : les chenilles roulent, et les stabilisateurs portent leur animation de déploiement
 * (pivots « dep|… », voir render/entities.ts) : de 0,08 à 0,3 les bras sortent du châssis, de 0,3 à 0,48 les
 * vérins posent les patins. Le gréement du module se déploie ensuite, de 0,5 à 1.
 */
export function chariotNomade(chariot: boolean, o: { l?: number; w?: number; zs?: number[]; cabine?: boolean } = {}): Part[] {
  const l = o.l ?? 2.5;
  const w = o.w ?? 1.0;
  const hl = l / 2;
  const hw = w / 2;
  const zs = o.zs ?? [q(hl - 0.4), q(-hl + 0.4)];
  const dep = (steps: string, nom: string): Partial<Part> => (chariot ? { pivot: `dep|${steps}#${nom}` } : {});
  const cx = q(-(hw - 0.17));
  const p: Part[] = [
    ...chenille(q(hw + 0.16), l, 0.42, 0.32, 0, 0, 0.34, chariot),
    { shape: "bevel", size: [w, 0.24, l], pos: [0, 0.4, 0], bevel: 0.04, color: "dark" },
    { shape: "box", size: [q(w + 0.36), 0.05, q(l - 0.16)], pos: [0, 0.55, -0.02], color: "metal" },
    // jupes d'équipe et garde-boue
    { shape: "box", size: [0.03, 0.2, q(l - 0.6)], pos: [q(hw + 0.34), 0.32, 0], color: "faction", mirror: true },
    { shape: "box", size: [0.34, 0.04, 0.22], pos: [q(hw + 0.16), 0.46, q(hl - 0.09)], color: "rust", mirror: true },
    { shape: "box", size: [0.34, 0.04, 0.22], pos: [q(hw + 0.16), 0.46, q(-hl + 0.09)], color: "rust", mirror: true },
  ];
  if (o.cabine ?? true) {
    // cabine à gauche, à l'avant : caisse, fente vitrée, toit de bâche, phares
    p.push(
      { shape: "bevel", size: [0.6, 0.42, 0.52], pos: [cx, 0.78, q(hl - 0.33)], bevel: 0.04, color: "metal" },
      { shape: "box", size: [0.48, 0.1, 0.03], pos: [cx, 0.88, q(hl - 0.06)], color: "glass" },
      { shape: "box", size: [0.03, 0.1, 0.3], pos: [q(-(hw + 0.14)), 0.88, q(hl - 0.33)], color: "glass" },
      { shape: "extrude", profile: voute(0.33, 0.12, 6), depth: 0.56, pos: [cx, 0.99, q(hl - 0.33)], color: "dry" },
      { shape: "box", size: [0.1, 0.06, 0.03], pos: [q(cx - 0.22), 0.66, q(hl - 0.06)], color: "amber" },
      { shape: "box", size: [0.1, 0.06, 0.03], pos: [q(cx + 0.22), 0.66, q(hl - 0.06)], color: "amber" },
    );
  }
  // stabilisateurs : bras coulissants (et leur fourreau de vérin), vérins et patins
  for (const sx of [1, -1]) {
    const cote = sx > 0 ? "d" : "g";
    for (const z of zs) {
      p.push(
        { shape: "box", size: [0.6, 0.1, 0.13], pos: [q(sx * (hw + 0.35)), 0.44, z], color: "rust", ...dep(`t:${-sx * 0.6},0,0:0.08:0.3`, `bras_${cote}`) },
        { shape: "box", size: [0.18, 0.11, 0.135], pos: [q(sx * (hw + 0.2)), 0.445, z], color: "hazard", ...dep(`t:${-sx * 0.6},0,0:0.08:0.3`, `bras_${cote}`) },
        { shape: "cylinder", sides: 6, radius: 0.08, height: 0.26, pos: [q(sx * (hw + 0.62)), 0.5, z], color: "dark", ...dep(`t:${-sx * 0.6},0,0:0.08:0.3`, `bras_${cote}`) },
        { shape: "cylinder", sides: 6, radius: 0.05, height: 0.42, pos: [q(sx * (hw + 0.62)), 0.24, z], color: "steel", ...dep(`t:${-sx * 0.6},0,0:0.08:0.3|t:0,0.3,0:0.3:0.48`, `pied_${cote}`) },
        { shape: "cylinder", sides: 6, radius: 0.17, radiusTop: 0.11, height: 0.06, pos: [q(sx * (hw + 0.62)), 0.03, z], color: "dark", ...dep(`t:${-sx * 0.6},0,0:0.08:0.3|t:0,0.3,0:0.3:0.48`, `pied_${cote}`) },
      );
    }
  }
  return p;
}
