// Pause d'une vraie partie relayée : aucun tick pendant la pause, puis les ticks reprennent sans trou ni
// doublon, et une simulation qui rejoue les ticks reçus (comme un client) garde les hash du serveur.
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { Sim, HASH_EVERY, stop } from "@supreme/shared";
import type { LobbyState } from "@supreme/shared";
import { Game, type GameHooks, type Peer } from "../src/game.ts";

const wasmPath = new URL("../../client/public/sim.wasm", import.meta.url).pathname;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("pause d'une partie relayée", () => {
  it("la simulation s'arrête au même tick pour tous et reprend à l'identique", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pause-"));
    const ticks: { tick: number; orders: number[] }[] = [];
    const said: { t: string }[] = [];
    const hooks: GameHooks = {
      broadcast: (m) => {
        const msg = m as { t: string; tick: number; orders: number[] };
        if (msg.t === "tick") ticks.push({ tick: msg.tick, orders: msg.orders });
        else said.push(msg);
      },
      peers: () => [],
      onEnd: () => {},
      log: () => {},
    };
    const players: LobbyState["players"] = [
      { slot: 0, name: "H", bot: false, team: 0, connected: true, host: true },
      { slot: 1, name: "IA", bot: true, team: 1, connected: true, host: false, personality: "rush", level: "normal" },
    ];
    const lobby: LobbyState = { players, mapSize: 512, water: false, seed: 5, running: true, tick: 0, save: null };
    const g = new Game(lobby, hooks, wasmPath, dir);
    const me: Peer = { slot: 0, name: "H", connected: true, ackTick: 0, send: () => {} };
    try {
      await g.start();
      g.setSpeed(me, 4);
      while (g.tick < 60) await wait(20);
      expect(g.setSpeed(me, 0)).toBe(true);
      const at = g.tick;
      const simAt = g.sim.tick();
      // un ordre donné pendant la pause attend la reprise
      g.submit(0, at + 3, stop([1]));
      expect(g.pending.length).toBeGreaterThan(0);
      await wait(400);
      expect(g.tick).toBe(at);
      expect(g.sim.tick()).toBe(simAt);
      expect(ticks.length).toBe(at);
      expect(g.setSpeed(me, 4)).toBe(true);
      while (g.tick < at + 60) await wait(20);
      g.stop();
      expect(ticks.some((t) => t.tick >= at && t.orders.length > 0)).toBe(true);
      // ticks consécutifs, sans trou ni doublon autour de la pause
      expect(ticks.map((t) => t.tick)).toEqual(ticks.map((_, i) => i));
      // un « client » rejoue les ticks reçus : mêmes hash que le serveur
      const client = await Sim.load(readFileSync(wasmPath));
      client.init(g.params);
      let checked = 0;
      for (const t of ticks) {
        const h = client.step(t.orders);
        const mine = g.hashes.get(t.tick);
        if (t.tick % HASH_EVERY === 0 && mine !== undefined) {
          expect(h).toBe(mine);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(4);
      expect(said.filter((m) => m.t === "speed").map((m) => (m as unknown as { speed: number }).speed)).toEqual([4, 0, 4]);
    } finally {
      g.stop();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);
});
