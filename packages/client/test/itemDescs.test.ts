// Chaque ressource de la simulation a sa description (infobulle au survol).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Sim } from "@supreme/shared";
import type { GameData } from "@supreme/shared";
import { ITEM_DESCS, itemRecipe, itemTip, itemUses } from "../src/game/itemDescs.ts";

describe("descriptions des ressources", () => {
  it("une description non vide par ressource, et aucune en trop ; recette et usages d'après les données", async () => {
    const sim = await Sim.load(readFileSync(new URL("../public/sim.wasm", import.meta.url)));
    const d = JSON.parse(sim.dataJson()) as GameData;
    const keys = d.items.slice(1).map((i) => i.key);
    expect(keys.filter((k) => !ITEM_DESCS[k]?.trim())).toEqual([]);
    expect(Object.keys(ITEM_DESCS).filter((k) => !keys.includes(k))).toEqual([]);
    const id = (k: string) => d.items.findIndex((i) => i.key === k);
    expect(itemRecipe(d, id("steel"))).toBe("Fonderie : 5 × plaque de fer → 1 en 8 s");
    expect(itemRecipe(d, id("iron_ore"))).toBe("");
    expect(itemUses(d, id("iron_ore"), 0)).toBe("plaque de fer");
    expect(itemUses(d, id("steel"), 0)).toMatch(/moteur, .*bâtiments · \d+ unités$/);
    expect(itemTip(d, id("steel"), 0)).toContain("<b>Acier</b>");
    expect(itemTip(d, id("steel"), 0, false)).not.toContain("<b>");
    expect(itemTip(d, 0, 0)).toBe("");
  });
});
