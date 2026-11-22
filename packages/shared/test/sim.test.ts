// Tests de l'enveloppe de simulation, des ordres et du tampon de rendu.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { Sim } from "../src/sim.ts";
import { pack, move, build, research, O, validCmd, target } from "../src/orders.ts";
import { parseFrame, parseBotDump, UNIT_WORDS } from "../src/render.ts";
import type { GameData } from "../src/data.ts";

const wasm = readFileSync(new URL("../../client/public/sim.wasm", import.meta.url));
const params = [7, 512, 1, 2, 0, 0, 100, 100, 1, 1, 100, 100];
let data: GameData;

beforeAll(async () => {
  const s = await Sim.load(wasm);
  data = JSON.parse(s.dataJson());
});

describe("données", () => {
  it("contient 81 unités (55 des Industriels et de la faune, 10 de la Souche dont 3 œufs, 16 des Transhumants), 72 bâtiments (53 dont le relais logistique, 9, 10 : neuf modules et le poteau nomade) et 64 recherches (48, 10, 6)", () => {
    expect(data.units.length).toBe(81);
    expect(data.buildings.length).toBe(72);
    expect(data.buildings.filter((b) => b.race === 2).length).toBe(10);
    expect(data.techs.length).toBe(64);
    expect(data.races.map((r) => r.key)).toEqual(["industriels", "souche", "transhumants"]);
    expect(data.units.filter((u) => u.race === 1).length).toBe(10);
    // Souche : les organismes naissent par portées de 3 à 6 œufs ; un œuf ne sort d'aucune usine
    const eggs = data.units.filter((u) => u.egg);
    expect(eggs.map((u) => u.key)).toEqual(["egg_s", "egg_m", "egg_l"]);
    for (const u of eggs) expect([u.factory, u.litter, u.speed, u.weapons.length]).toEqual([0, 0, 0, 0]);
    expect(data.units.filter((u) => u.litter > 0).map((u) => [u.key, u.litter])).toEqual([["sower", 3], ["gnawer", 6], ["spitter", 4], ["shell", 3], ["vine", 4], ["membrane", 3]]);
    expect(data.units.filter((u) => u.race === 2).length).toBe(16);
    // une unité de commandement par race
    expect(data.units.filter((u) => u.commander).map((u) => u.key)).toEqual(["commander", "queen", "ark"]);
    expect(data.units[0].key).toBe("commander");
    // la faune : aucune usine ne produit ses bêtes, et son nid n'est pas une construction de joueur
    for (const k of ["beast_s", "beast_m", "beast_l"]) expect(data.units.find((u) => u.key === k)?.factory).toBe(0);
    expect(data.buildings.find((b) => b.key === "nest")?.cls).toBe(26);
  });
});

describe("ordres", () => {
  it("encode longueur, type et joueur", () => {
    const out: number[] = [];
    pack(3, research(5), out);
    expect(out).toEqual([3, O.RESEARCH, 3, 5]);
  });
  it("garde la formation autour du but", () => {
    const c = move([{ id: 1, x: 0, y: 0 }, { id: 2, x: 512, y: 0 }], 10000, 10000);
    expect(c.slice(0, 5)).toEqual([O.MOVE, 0, 10000, 10000, 2]);
    expect(c[6]).toBeLessThan(c[9]);
  });
  it("rejette les ordres mal formés", () => {
    expect(validCmd([1, 2, 3])).toBe(true);
    expect(validCmd([1, 2.5])).toBe(false);
    expect(validCmd("x")).toBe(false);
    expect(validCmd([])).toBe(false);
  });
});

describe("simulation", () => {
  it("donne le même hash à graine et ordres identiques", async () => {
    const a = await Sim.load(wasm);
    const b = await Sim.load(wasm);
    expect(a.init(params)).toBe(b.init(params));
    for (let t = 0; t < 200; t++) expect(a.step([])).toBe(b.step([]));
  });
  it("ignore les ordres sur les unités d'un autre joueur", async () => {
    const a = await Sim.load(wasm);
    const b = await Sim.load(wasm);
    a.init(params);
    b.init(params);
    const view = parseBotDump(a.botDump());
    const enemyCommander = view.players[1].commander;
    const o: number[] = [];
    pack(0, move([{ id: enemyCommander, x: 0, y: 0 }], 2560, 2560), o);
    for (let t = 0; t < 50; t++) expect(a.step(t === 0 ? o : [])).toBe(b.step([]));
  });
  it("le commandant construit un générateur avec le stock", async () => {
    const a = await Sim.load(wasm);
    a.init(params);
    const v = parseBotDump(a.botDump());
    const c = v.units.find((u) => u.id === v.players[0].commander)!;
    const tx = (c.x >> 8) + 3;
    const ty = (c.y >> 8) + 3;
    let ok = false;
    for (let dx = 0; dx < 8 && !ok; dx++) if (a.canPlace(0, 13, tx + dx, ty, 0)) {
      const o: number[] = [];
      pack(0, build([c.id], 13, tx + dx, ty, 0), o);
      a.step(o);
      ok = true;
    }
    expect(ok).toBe(true);
    for (let t = 0; t < 400; t++) a.step([]);
    const v2 = parseBotDump(a.botDump());
    expect(v2.buildings.some((b) => b.kind === 13 && b.build >= 65536)).toBe(true);
    expect(v2.players[0].stock[6]).toBeLessThan(300);
  });
  it("la fiche d'un tapis donne son contenu (case et file), null pour un autre bâtiment", async () => {
    const a = await Sim.load(wasm);
    a.init(params);
    const belt = data.buildings.findIndex((b) => b.key === "belt1");
    const v = parseBotDump(a.botDump());
    const c = v.units.find((u) => u.id === v.players[0].commander)!;
    let spot: [number, number] | null = null;
    for (let d = 3; d < 30 && !spot; d++) if (a.canPlace(0, belt, (c.x >> 8) + d, (c.y >> 8) + 3, 0)) spot = [(c.x >> 8) + d, (c.y >> 8) + 3];
    expect(spot).not.toBeNull();
    const o: number[] = [];
    pack(0, build([c.id], belt, spot![0], spot![1], 0), o);
    a.step(o);
    for (let t = 0; t < 300; t++) a.step([]);
    // les tapis ne sont pas dans la vue des bots : on les cherche par leur case
    const ref = a.buildingAt(spot![0], spot![1]);
    const info = a.infoBuilding(ref) as { kind: number; build: number; belt: unknown };
    expect([info.kind, info.build]).toEqual([belt, 65536]);
    expect(info.belt).toMatchObject({ tile: [], line: [], tiles: 1, cap: 4, jam: 0 });
    // le bâtiment de départ n'est pas un tapis : pas de contenu de tapis
    const other = parseBotDump(a.botDump()).buildings.find((x) => x.owner === 0);
    expect(other).toBeDefined();
    expect((a.infoBuilding(other!.ref) as { belt: unknown }).belt).toBeNull();
  });
  it("aperçu des jumelles : deux laboratoires posés côte à côte sont liserés sur leur côté commun", async () => {
    const a = await Sim.load(wasm);
    a.init(params);
    const lab = data.buildings.findIndex((b) => b.key === "lab");
    const v = parseBotDump(a.botDump());
    const c = v.units.find((u) => u.id === v.players[0].commander)!;
    let spot: [number, number] | null = null;
    for (let d = 3; d < 30 && !spot; d++) {
      const [x, y] = [(c.x >> 8) + d, (c.y >> 8) + 3];
      if (a.canPlace(0, lab, x, y, 0) && a.canPlace(0, lab, x + 2, y, 0)) spot = [x, y];
    }
    expect(spot).not.toBeNull();
    const [x, y] = spot!;
    // côtés : 0 (+x), 2 (-x) ; deux cases par côté (bits côté × 8 + case)
    expect(Array.from(a.twinPreview([0, lab, x, y, 0, x + 2, y, 1]))).toEqual([0b11, 0b11 << 16]);
    // un seul laboratoire, ou une case impossible : aucun liseré
    expect(Array.from(a.twinPreview([0, lab, x, y, 0]))).toEqual([0]);
    expect(Array.from(a.twinPreview([0, lab, x, y, 0, -50, -50, 0]))).toEqual([0, 0]);
  });
  it("disponible à portée (couleur des coûts) : soute du commandant près de lui, ou partout s'il construit", async () => {
    const a = await Sim.load(wasm);
    a.init(params);
    const v = parseBotDump(a.botDump());
    const c = v.units.find((u) => u.id === v.players[0].commander)!;
    const iron = data.items.findIndex((it) => it.key === "iron_plate");
    const [cx, cy] = [c.x >> 8, c.y >> 8];
    // ressources de départ dans sa soute : à portée près de lui
    expect(a.reachStock([0, cx + 5, cy, 30])[iron]).toBe(300);
    // loin de lui, sans constructeur : rien (pas le stock de tout le joueur)
    expect(a.reachStock([0, cx + 120, cy, 30])[iron]).toBe(0);
    // loin, mais construit par le commandant : il emporte sa soute
    expect(a.reachStock([0, cx + 120, cy, 30, c.id])[iron]).toBe(300);
    // pas compté deux fois quand il est à portée
    expect(a.reachStock([0, cx + 5, cy, 30, c.id])[iron]).toBe(300);
  });
  it("produit un tampon de rendu lisible", async () => {
    const a = await Sim.load(wasm);
    a.init(params);
    a.step([]);
    const f = parseFrame(a.render(0, 0, 512, 512, 2, 0, true));
    expect(f.players.length).toBe(2);
    expect(f.nUnits).toBe(2);
    expect(f.vis?.length).toBe(128 * 128);
    expect(f.buf[f.unitOff + 1] & 0xff).toBe(0);
    expect(UNIT_WORDS).toBe(9);
  });
  it("snapshot puis restore reprend à l'identique", async () => {
    const a = await Sim.load(wasm);
    a.init(params);
    const v = parseBotDump(a.botDump());
    const o: number[] = [];
    pack(0, target(O.ATTACK, [v.players[0].commander], v.players[1].commander), o);
    a.step(o);
    for (let t = 0; t < 100; t++) a.step([]);
    const snap = a.snapshot();
    const b = await Sim.load(wasm);
    b.restore(snap);
    for (let t = 0; t < 200; t++) expect(b.step([])).toBe(a.step([]));
  });
});
