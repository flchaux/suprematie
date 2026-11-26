// Gabarits d'équipement des unités des Transhumants (sim/src/gabarits.rs) : lecture de la fiche, coût, temps.
// Fonctions pures, testées par packages/client/test/kits.test.ts.
import type { GameData, ModDef, ModInfo, ModSlot } from "@supreme/shared";
import { KITS } from "@supreme/shared";

/** Un gabarit : une amélioration par emplacement (arme, châssis, équipement ; 0 : rien). */
export type KitSet = [number, number, number];

/** Un gabarit est transmis en un nombre : un octet par emplacement. */
export const unpackKit = (v: number): KitSet => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255];
export const emptyKit = (s: KitSet): boolean => s.every((m) => !m);

/** Emplacements d'un porteur : l'Arche, un module, une unité de combat, un chariot de convoi, le chariot bouclier. */
export function slotsOf(d: GameData, host: number): ModSlot[] {
  const u = d.units[host];
  if (!u) return [];
  if (u.key === "ark") return d.arkSlots;
  if (u.key === "t_cart") return [d.oneSlot];
  if (u.key === "t_shield_cart" && d.shieldSlots) return d.shieldSlots;
  return u.deploys >= 0 ? d.moduleSlots : d.unitSlots;
}

/** Ce type d'unité a-t-il des gabarits ? (une unité de combat : trois emplacements) */
export function hasKits(d: GameData, kind: number): boolean {
  return slotsOf(d, kind) === d.unitSlots && d.mods.some((m) => m.host === kind);
}

/** Gabarits d'un type d'unité ; `active` : celui de la production (1 à KITS ; 0 : aucun). */
export function kitsOf(kits: ModInfo["kits"], kind: number): { active: number; sets: KitSet[] } {
  const k = kits.find((x) => x[0] === kind);
  return { active: k?.[1] ?? 0, sets: Array.from({ length: KITS }, (_, i) => unpackKit(k?.[2 + i] ?? 0)) };
}

/** Choix possibles d'un emplacement d'un type d'unité. */
export function kitChoices(d: GameData, kind: number, slot: number): { m: ModDef; i: number }[] {
  return d.mods.map((m, i) => ({ m, i })).filter(({ m, i }) => i > 0 && m.host === kind && m.slot === slot);
}

/** Coût d'un gabarit (objets additionnés, relevés compris) et temps de fabrication en plus (s). */
export function kitCost(d: GameData, set: KitSet): { cost: [number, number][]; time: number } {
  const sum = new Map<number, number>();
  let time = 0;
  for (const m of set) {
    if (!m) continue;
    for (const [it, n] of d.mods[m].cost) sum.set(it, (sum.get(it) ?? 0) + n);
    time += d.mods[m].time / 2;
  }
  return { cost: [...sum.entries()].sort((a, b) => a[0] - b[0]), time };
}

/** Améliorations voulues que l'unité n'a pas encore. */
export function kitPending(want: number, mods: number[]): number[] {
  return unpackKit(want).filter((m, k) => m > 0 && mods[k] !== m);
}
