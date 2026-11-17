// Sauvegarde de partie : stockage des fichiers, et reprise exacte (simulation + état interne des IA).
import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Sim, pack, parseBotDump, ORDER_DELAY } from "@supreme/shared";
import type { GameData, SaveMeta } from "@supreme/shared";
import { createBot, type Bot, type MapInfo } from "../src/bots/index.ts";
import { writeSave, readSave, listSaves, deleteSave, pruneAutosaves, validSaveId, type SaveData } from "../src/saves.ts";

const wasm = readFileSync(new URL("../../client/public/sim.wasm", import.meta.url));

function mapOf(sim: Sim): MapInfo {
  const info = sim.mapInfo();
  const map: MapInfo = { w: info[0], h: info[1], waterLevel: info[2], starts: [], spots: [], heights: sim.mapHeights() };
  let o = 4;
  for (let i = 0; i < info[3]; i++, o += 2) map.starts.push([info[o], info[o + 1]]);
  const ns = info[o++];
  for (let i = 0; i < ns; i++, o += 3) map.spots.push({ kind: info[o], x: info[o + 1], y: info[o + 2] });
  return map;
}

/** Une partie entre IA, comme le relais : décision tous les 10 ticks, ordres 3 ticks plus tard. */
class Run {
  pending: { tick: number; player: number; cmd: number[] }[] = [];
  log: string[] = [];
  constructor(
    public sim: Sim,
    public bots: Bot[],
  ) {}
  step(n: number): number[] {
    const hashes: number[] = [];
    for (let k = 0; k < n; k++) {
      const t = this.sim.tick();
      if (t % 10 === 0) {
        const v = parseBotDump(this.sim.botDump());
        this.bots.forEach((b, i) => {
          if (!v.players[i].alive) return;
          for (const c of b.think(v)) {
            this.pending.push({ tick: t + ORDER_DELAY, player: i, cmd: c });
            this.log.push(`${t}:${i}:${c.join(",")}`);
          }
        });
      }
      const orders: number[] = [];
      this.pending = this.pending.filter((p) => (p.tick <= t ? (pack(p.player, p.cmd, orders), false) : true));
      hashes.push(this.sim.step(orders));
    }
    return hashes;
  }
}

describe("sauvegarde de partie", () => {
  it("reprend exactement : simulation, IA et ordres en attente", async () => {
    const params = [11, 512, 0, 2, 0, 1, 100, 100, 1, 1, 100, 100];
    const sim = await Sim.load(wasm);
    sim.init(params);
    const data: GameData = JSON.parse(sim.dataJson());
    const map = mapOf(sim);
    const mk = (s: Sim, slot: number, m: MapInfo) => createBot({ slot, personality: slot ? "rush" : "adaptive", aix: 100, level: "difficile", sim: s, data, map: m });
    const a = new Run(sim, [mk(sim, 0, map), mk(sim, 1, map)]);
    a.step(4000);
    // sauvegarde : instantané, états des IA, ordres en attente
    const snap = sim.snapshot();
    const states = a.bots.map((b) => b.save!());
    const sim2 = await Sim.load(wasm);
    expect(sim2.restore(snap)).toBeTruthy();
    const map2 = mapOf(sim2);
    const restored = [mk(sim2, 0, map2), mk(sim2, 1, map2)];
    restored.forEach((b, i) => b.load!(states[i]));
    const b = new Run(sim2, restored);
    b.pending = a.pending.map((p) => ({ ...p, cmd: [...p.cmd] }));
    a.log = [];
    const ha = a.step(3000);
    const hb = b.step(3000);
    // mêmes ordres des IA et même état de simulation à chaque tick
    expect(b.log.length).toBeGreaterThan(50);
    expect(b.log).toEqual(a.log);
    expect(hb).toEqual(ha);
  }, 120000);

  it("écrit, liste, relit et supprime les sauvegardes", () => {
    const dir = mkdtempSync(join(tmpdir(), "saves-"));
    try {
      const meta = (id: string, auto: boolean, savedAt: string): SaveMeta => ({ id, name: id, savedAt, tick: 100, auto, mapSize: 512, water: false, seed: 1, players: [{ name: "A", bot: false, team: 0 }] });
      const stats = [{ tick: 0, players: [{ alive: true, units: 1, army: 0, armyValue: 0, ore: 0, powerProd: 0, powerUse: 0, research: 0, buildings: 0, kills: 0, losses: 0 }] }];
      const data = (m: SaveMeta): SaveData => ({ version: 1, meta: m, params: [1, 512, 0, 1, 0, 0, 100, 100], snapshot: "AAAA", bots: [], pending: [], replay: [[3, [1, 2, 3]]], stats });
      writeSave(dir, data(meta("s-1", false, "2026-01-01T00:00:00Z")));
      for (let i = 0; i < 7; i++) writeSave(dir, data(meta(`auto-${i}`, true, `2026-01-0${i + 2}T00:00:00Z`)));
      expect(listSaves(dir).map((m) => m.id)[0]).toBe("auto-6");
      pruneAutosaves(dir, 5);
      const ids = listSaves(dir).map((m) => m.id);
      expect(ids).toHaveLength(6);
      expect(ids).toContain("s-1");
      expect(ids).not.toContain("auto-0");
      expect(readSave(dir, "s-1")?.replay).toEqual([[3, [1, 2, 3]]]);
      expect(readSave(dir, "s-1")?.stats).toEqual(stats);
      deleteSave(dir, "s-1");
      expect(readSave(dir, "s-1")).toBeNull();
      // identifiants refusés (chemins)
      expect(validSaveId("../key")).toBe(false);
      expect(readSave(dir, "../../etc/passwd")).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
