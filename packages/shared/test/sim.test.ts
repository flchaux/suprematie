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
  it("contient les 36 unités, 35 bâtiments et 43 recherches", () => {
    expect(data.units.length).toBe(36);
    expect(data.buildings.length).toBe(35);
    expect(data.techs.length).toBe(43);
    expect(data.units[0].key).toBe("commander");
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
