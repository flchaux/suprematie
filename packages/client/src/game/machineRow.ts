// Rangée de machines posée en glissant (fabricants, laboratoires, usines : celles qui se jumellent).

import { BClass } from "@supreme/shared";

/** Machines qui peuvent se jumeler (voir sim twins.rs) : elles se posent en rangée en glissant. */
export function isMachine(cls: number): boolean {
  return cls === BClass.Crafter || cls === BClass.Lab || cls === BClass.Factory;
}

/**
 * Emplacements d'une rangée de machines de `a` vers `b` (coins haut-gauche) : en ligne droite le long
 * de l'axe où la souris s'est le plus éloignée, emprises collées (pas de l'emprise tournée selon `dir`),
 * 64 au plus. Des machines collées sur la même recette forment une rangée de jumelles.
 */
export function machineRow(a: { x: number; y: number }, b: { x: number; y: number }, def: { w: number; h: number }, dir: number): { x: number; y: number; dir: number }[] {
  const fw = dir & 1 ? def.h : def.w;
  const fh = dir & 1 ? def.w : def.h;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const horiz = Math.abs(dx) >= Math.abs(dy);
  const step = horiz ? fw : fh;
  const dist = Math.abs(horiz ? dx : dy);
  const sign = Math.sign(horiz ? dx : dy) || 1;
  // une machine de plus dès que la souris a passé la moitié de la suivante
  const n = Math.min(64, Math.floor((dist + step / 2) / step) + 1);
  const out: { x: number; y: number; dir: number }[] = [];
  for (let i = 0; i < n; i++) out.push(horiz ? { x: a.x + i * step * sign, y: a.y, dir } : { x: a.x, y: a.y + i * step * sign, dir });
  return out;
}
