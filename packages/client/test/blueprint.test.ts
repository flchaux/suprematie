// Plans : rotation, capture, pose, regroupement par type, répartition entre ingénieurs, export / import, bibliothèque.
import { describe, it, expect } from "vitest";
import { BClass, BUILD_FULL, RECIPE_NONE } from "@supreme/shared";
import * as BP from "../src/game/blueprint.ts";

// données minimales : un tapis, un bras, un assembleur 3×3, une fonderie 2×2, un bâtiment rectangulaire 3×1, un entrepôt
const data: BP.PlanData = {
  buildings: [
    { key: "belt1", w: 1, h: 1, cls: BClass.Belt },
    { key: "inserter", w: 1, h: 1, cls: BClass.Inserter },
    { key: "assembler1", w: 3, h: 3, cls: BClass.Crafter, crafter: 1 },
    { key: "furnace", w: 2, h: 2, cls: BClass.Crafter, crafter: 0 },
    { key: "long", w: 3, h: 1, cls: BClass.Wall },
    { key: "warehouse", w: 2, h: 2, cls: BClass.Warehouse },
  ],
  recipes: [{ key: "iron_plate" }, { key: "gear" }],
  items: [{ key: "none" }, { key: "iron_plate" }, { key: "gear" }],
};
const K = { belt: 0, ins: 1, asm: 2, fur: 3, long: 4, wh: 5 };

/** Cases occupées par un plan (pour comparer des empreintes). */
function occupied(parts: BP.PlanPart[]): string[] {
  const idx = new Map(data.buildings.map((b, i) => [b.key, i]));
  const out: string[] = [];
  for (const p of parts) {
    const [w, h] = BP.dims(data, idx.get(p.key)!, p.dir);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.push(`${p.x + x},${p.y + y}`);
  }
  return out.sort();
}

const sample: BP.PlanPart[] = BP.normalize(data, [
  { key: "belt1", x: 0, y: 0, dir: 0 },
  { key: "belt1", x: 1, y: 0, dir: 0 },
  { key: "inserter", x: 2, y: 0, dir: 1 },
  { key: "assembler1", x: 1, y: 1, dir: 0, recipe: "gear" },
  { key: "long", x: 0, y: 4, dir: 0 },
]);

describe("rotation", () => {
  it("un quart de tour : positions, directions et empreintes", () => {
    const r = BP.rotatePlan(data, sample);
    expect(BP.planSize(data, sample)).toEqual({ w: 4, h: 5 });
    expect(BP.planSize(data, r)).toEqual({ w: 5, h: 4 });
    // tapis vers l'est → vers le sud ; bras vers le sud → vers l'ouest
    const belts = r.filter((p) => p.key === "belt1");
    expect(belts.every((p) => p.dir === 1)).toBe(true);
    expect(r.find((p) => p.key === "inserter")!.dir).toBe(2);
    // le tapis (0,0) du coin haut-gauche passe dans le coin haut-droit
    expect(belts.map((p) => [p.x, p.y])).toContainEqual([4, 0]);
    expect(belts.map((p) => [p.x, p.y])).toContainEqual([4, 1]);
    // le bâtiment 3×1 devient 1×3 : il occupe une colonne
    const long = r.find((p) => p.key === "long")!;
    expect(long).toMatchObject({ x: 0, y: 0, dir: 1 });
    expect(BP.dims(data, K.long, long.dir)).toEqual([1, 3]);
    // la recette suit
    expect(r.find((p) => p.key === "assembler1")!.recipe).toBe("gear");
  });

  it("quatre quarts de tour reviennent au plan de départ", () => {
    let r = sample;
    for (let i = 0; i < 4; i++) r = BP.rotatePlan(data, r);
    expect(r).toEqual(sample);
  });

  it("aucun chevauchement après rotation (même nombre de cases, toutes distinctes)", () => {
    let r = sample;
    const n = occupied(sample).length;
    for (let i = 0; i < 3; i++) {
      r = BP.rotatePlan(data, r);
      const occ = occupied(r);
      expect(occ.length).toBe(n);
      expect(new Set(occ).size).toBe(n);
      expect(Math.min(...r.map((p) => p.x))).toBe(0);
      expect(Math.min(...r.map((p) => p.y))).toBe(0);
    }
  });

  it("l'empreinte tournée correspond à la rotation des cases", () => {
    // rotation des cases : (x, y) → (H-1-y, x) avec H la hauteur du plan
    const { h } = BP.planSize(data, sample);
    const expected = occupied(sample).map((s) => {
      const [x, y] = s.split(",").map(Number);
      return `${h - 1 - y},${x}`;
    }).sort();
    expect(occupied(BP.rotatePlan(data, sample))).toEqual(expected);
  });
});

describe("capture", () => {
  const seen: BP.SeenBuilding[] = [
    { ref: 10, kind: K.belt, owner: 0, dir: 0, x: 100, y: 50, build: BUILD_FULL },
    { ref: 11, kind: K.asm, owner: 0, dir: 0, x: 101, y: 51, build: BUILD_FULL },
    { ref: 12, kind: K.belt, owner: 1, dir: 0, x: 102, y: 50, build: BUILD_FULL }, // ennemi
    { ref: 13, kind: K.belt, owner: 0, dir: 0, x: 103, y: 50, build: BUILD_FULL / 2 }, // chantier
    { ref: 14, kind: K.fur, owner: 0, dir: 0, x: 104, y: 52, build: BUILD_FULL }, // dépasse du cadre
    { ref: 15, kind: K.long, owner: 0, dir: 1, x: 99, y: 50, build: BUILD_FULL }, // 1×3 tourné
  ];
  it("garde les bâtiments terminés du joueur entièrement dans le cadre", () => {
    const c = BP.captureArea(data, seen, 0, 104, 53, 99, 50);
    expect(c.map((b) => b.ref)).toEqual([15, 10, 11]);
    const parts = BP.partsFrom(data, c, [undefined, undefined, "gear"]);
    expect(parts).toEqual([
      { key: "long", x: 0, y: 0, dir: 1 },
      { key: "belt1", x: 1, y: 0, dir: 0 },
      { key: "assembler1", x: 2, y: 1, dir: 0, recipe: "gear" },
    ]);
  });

  it("recettes : assembleur toujours, fonderie seulement si verrouillée, entrepôt si une sortie est choisie", () => {
    expect(BP.recipeKey(data, K.asm, { recipe: 1, repeat: false })).toBe("gear");
    expect(BP.recipeKey(data, K.asm, { recipe: RECIPE_NONE })).toBeUndefined();
    expect(BP.recipeKey(data, K.fur, { recipe: 0, repeat: false })).toBeUndefined();
    expect(BP.recipeKey(data, K.fur, { recipe: 0, repeat: true })).toBe("iron_plate");
    expect(BP.recipeKey(data, K.wh, { recipe: 2 })).toBe("gear");
    expect(BP.recipeKey(data, K.wh, { recipe: 0 })).toBeUndefined();
    expect(BP.recipeKey(data, K.belt, { recipe: 1 })).toBeUndefined();
  });
});

describe("pose et regroupement", () => {
  it("centre le plan sur le curseur et retrouve les indices de recette", () => {
    const cells = BP.placePlan(data, sample, 50.3, 20.6);
    // plan 4×5 : coin en (round(48.3), round(18.1)) = (48, 18)
    expect(cells[0]).toEqual({ kind: K.belt, x: 48, y: 18, dir: 0, recipe: -1 });
    expect(cells.find((c) => c.kind === K.asm)).toEqual({ kind: K.asm, x: 49, y: 19, dir: 0, recipe: 1 });
  });

  it("ignore les types inconnus", () => {
    expect(BP.placePlan(data, [{ key: "inconnu", x: 0, y: 0, dir: 0 }, { key: "belt1", x: 1, y: 0, dir: 0 }], 0, 0)).toHaveLength(1);
  });

  it("regroupe par type pour canPlaceMany", () => {
    const cells = BP.placePlan(data, sample, 10, 10);
    const g = BP.groupByKind(cells);
    expect(g.map(([k]) => k)).toEqual([K.belt, K.ins, K.asm, K.long]);
    const belts = g[0][1];
    expect(belts).toHaveLength(2);
    expect(BP.canPlaceArgs(3, K.belt, belts.map((i) => cells[i]))).toEqual([3, K.belt, cells[belts[0]].x, cells[belts[0]].y, 0, cells[belts[1]].x, cells[belts[1]].y, 0]);
    // chaque case apparaît une fois
    expect(g.flatMap(([, idx]) => idx).sort((a, b) => a - b)).toEqual(cells.map((_, i) => i));
  });
});

describe("ordre et répartition", () => {
  const row = (n: number): BP.PlacedCell[] => Array.from({ length: n }, (_, i) => ({ kind: K.belt, x: i, y: 0, dir: 0, recipe: -1 }));
  it("plus proche voisin depuis l'ingénieur", () => {
    const cells = [5, 0, 3, 1, 4, 2].map((x) => ({ kind: K.belt, x, y: 0, dir: 0, recipe: -1 }));
    expect(BP.nearestOrder(data, cells, 10, 0).map((c) => c.x)).toEqual([5, 4, 3, 2, 1, 0]);
    expect(BP.nearestOrder(data, cells, -3, 0).map((c) => c.x)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("petit plan : tous les ingénieurs ensemble", () => {
    const g = BP.splitAmong(data, row(3), [{ id: 7, x: 0, y: 0 }, { id: 3, x: 0, y: 1 }]);
    expect(g).toHaveLength(1);
    expect(g[0].ids).toEqual([3, 7]);
    expect(g[0].cells.map((c) => c.x)).toEqual([0, 1, 2]);
  });

  it("grand plan : un tronçon par ingénieur, le plus proche", () => {
    const g = BP.splitAmong(data, row(20), [{ id: 1, x: -2, y: 0 }, { id: 2, x: 22, y: 0 }]);
    expect(g).toHaveLength(2);
    const all = g.flatMap((x) => x.cells.map((c) => c.x)).sort((a, b) => a - b);
    expect(all).toEqual(row(20).map((c) => c.x));
    const left = g.find((x) => x.ids.includes(1))!;
    const right = g.find((x) => x.ids.includes(2))!;
    expect(Math.max(...left.cells.map((c) => c.x))).toBeLessThan(Math.min(...right.cells.map((c) => c.x)));
    // chaque tronçon commence du côté de son ingénieur
    expect(left.cells[0].x).toBe(0);
    expect(right.cells[0].x).toBe(19);
  });

  it("ingénieurs en surnombre : chacun renforce un tronçon", () => {
    const engs = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, x: i, y: 1 }));
    const g = BP.splitAmong(data, row(8), engs);
    expect(g).toHaveLength(2);
    expect(g.flatMap((x) => x.ids).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(g.reduce((s, x) => s + x.cells.length, 0)).toBe(8);
  });

  it("rien à faire sans case ou sans ingénieur", () => {
    expect(BP.splitAmong(data, [], [{ id: 1, x: 0, y: 0 }])).toEqual([]);
    expect(BP.splitAmong(data, row(2), [])).toEqual([]);
  });
});

describe("export / import", () => {
  it("aller-retour, nom accentué compris", () => {
    const s = BP.exportPlan({ name: "Usine à engrenages", parts: sample });
    expect(s.startsWith(BP.EXPORT_PREFIX)).toBe(true);
    expect(/^[A-Za-z0-9+/=:-]+$/.test(s.replace(/\s/g, ""))).toBe(true);
    const r = BP.importPlan(s, data);
    expect(r).toEqual({ ok: true, name: "Usine à engrenages", parts: sample, unknown: 0 });
  });

  it("tolère espaces et retours à la ligne (texte recopié)", () => {
    const s = BP.exportPlan({ name: "A", parts: sample });
    const wrapped = "  " + s.slice(0, 20) + "\n" + s.slice(20, 50) + " \r\n" + s.slice(50) + "\n";
    expect(BP.importPlan(wrapped, data).ok).toBe(true);
  });

  it("écarte les types inconnus et les compte", () => {
    const s = BP.exportPlan({ name: "B", parts: [...sample, { key: "machine_future", x: 0, y: 0, dir: 0 }] });
    const r = BP.importPlan(s, data);
    expect(r.ok && r.unknown).toBe(1);
    expect(r.ok && r.parts.length).toBe(sample.length);
  });

  it("refuse les textes abîmés ou hors limites", () => {
    expect(BP.importPlan("bonjour").ok).toBe(false);
    expect(BP.importPlan(BP.EXPORT_PREFIX + "!!!").ok).toBe(false);
    const bad = (p: unknown) => BP.EXPORT_PREFIX + btoa(JSON.stringify({ n: "x", p }));
    expect(BP.importPlan(bad([["belt1", -1, 0, 0]])).ok).toBe(false);
    expect(BP.importPlan(bad([["belt1", 0, 0, 4]])).ok).toBe(false);
    expect(BP.importPlan(bad([["belt1", 0.5, 0, 0]])).ok).toBe(false);
    expect(BP.importPlan(bad([["belt1", 0, 0, 0, 12]])).ok).toBe(false);
    expect(BP.importPlan(bad([])).ok).toBe(false);
    expect(BP.importPlan(bad(Array.from({ length: BP.MAX_PARTS + 1 }, () => ["belt1", 0, 0, 0]))).ok).toBe(false);
    expect(BP.importPlan(bad("non")).ok).toBe(false);
  });
});

describe("bibliothèque", () => {
  function mem(init: Record<string, string> = {}) {
    const m = new Map(Object.entries(init));
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  }
  it("enregistre et relit", () => {
    const st = mem();
    const lib = { plans: [{ id: "a", name: "Plan 1", parts: sample, created: 1 }], active: "a" };
    expect(BP.saveLibrary(st, lib)).toBe(true);
    expect(BP.loadLibrary(st)).toEqual(lib);
  });
  it("stockage absent, plein ou illisible : bibliothèque vide, sans exception", () => {
    expect(BP.loadLibrary(null)).toEqual({ plans: [], active: "" });
    expect(BP.loadLibrary(mem({ [BP.LIBRARY_KEY]: "{abîmé" }))).toEqual({ plans: [], active: "" });
    const full = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } };
    expect(BP.saveLibrary(full, { plans: [], active: "" })).toBe(false);
    expect(BP.saveLibrary(null, { plans: [], active: "" })).toBe(false);
  });
  it("plan actif disparu : le premier devient actif", () => {
    const st = mem({ [BP.LIBRARY_KEY]: JSON.stringify({ plans: [{ id: "b", name: "x", parts: sample }], active: "zz" }) });
    expect(BP.loadLibrary(st).active).toBe("b");
  });
  it("nom libre", () => {
    expect(BP.nextName([])).toBe("Plan 1");
    expect(BP.nextName([{ name: "Plan 2" }])).toBe("Plan 3");
    expect(BP.nextName([{ name: "Plan 2" }, { name: "Plan 3" }])).toBe("Plan 4");
  });
});
