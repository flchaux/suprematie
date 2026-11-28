// Gestionnaire de la recherche : liste des recherches voulues et lancement de la prochaine.
import type { Cmd } from "@supreme/shared";
import { research } from "@supreme/shared";
import { arsenalPacks } from "./arsenal.ts";
import { navyResearch } from "./navy.ts";
import { landingResearch } from "./landing.ts";
import { availableAt } from "./factories.ts";
import type { SkirmishAI } from "./ai.ts";

/** La recherche a-t-elle encore besoin de lots de ce palier ? */
export function researchWants(ai: SkirmishAI, tier: number): boolean {
  const techs = ai.ctx.data.techs;
  for (const k of researchList(ai)) {
    const t = ai.ids.t[k];
    if (t === undefined || ai.has(t)) continue;
    if (techs[t].tier >= tier) return true;
  }
  return false;
}

/** Recherches voulues : celles de la marine et des transports, puis de la personnalité, puis leur suite. */
export function researchList(ai: SkirmishAI): string[] {
  const n = navyResearch(ai);
  const l = landingResearch(ai);
  return [...n.first, ...l.first, ...ai.persona.research, ...n.later, ...l.later];
}

// ---------- Recherche ----------
export function researchMgr(ai: SkirmishAI, out: Cmd[]): void {
  if (ai.me.research !== 0) return;
  if (ai.tick - ai.lastResearch < 40) return;
  const techs = ai.ctx.data.techs;
  // lots produits en amont d'un laboratoire
  const packs = new Set<number>();
  for (const m of ai.planner.modules) {
    for (const lab of m.slots) {
      if (lab.type !== "lab") continue;
      const st = ai.placementState(lab.places[0]);
      if (st !== 3) continue;
      for (const it of availableAt(ai, m, lab)) packs.add(it);
    }
  }
  arsenalPacks(ai, packs);
  const pack1 = ai.ids.item.pack1;
  // recherches urgentes selon les rapports de force, puis la liste de la personnalité
  const urgent: string[] = [];
  if (ai.level !== "facile") {
    if (ai.airRatio > 0.5) urgent.push("aa_turret", "heavy_air", "superiority", "heavy_aa");
    if (ai.anyUnreachable()) urgent.push("electronics", "hydrocarbons", "mobile_artillery", "assault", "heavy_air");
    if (ai.landRatio > 1.5) urgent.push("heavy_turret");
  }
  // l'antiaérien passe avant la marine et les transports quand l'aviation ennemie domine
  const first = [...navyResearch(ai).first, ...landingResearch(ai).first];
  for (const k of [...(ai.airRatio > 0.5 ? urgent : []), ...first, ...urgent, ...researchList(ai)]) {
    const t = ai.ids.t[k];
    if (t === undefined || ai.has(t)) continue;
    const td = techs[t];
    if (!td.prereq.every((q) => ai.has(q))) continue;
    let ok = true;
    for (let tier = 1; tier <= td.tier; tier++) if (!packs.has(pack1 + tier - 1)) ok = false;
    if (!ok) continue;
    out.push(research(t));
    ai.lastResearch = ai.tick;
    return;
  }
}
