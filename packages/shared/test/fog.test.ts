// Brouillard de guerre : réglage du salon transmis à la simulation par ses paramètres d'init.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Sim } from "../src/sim.ts";
import { parseFrame } from "../src/render.ts";
import { simParams, fogFromParams, type LobbyState } from "../src/protocol.ts";

const wasm = readFileSync(new URL("../../client/public/sim.wasm", import.meta.url));

function lobby(fog?: boolean): LobbyState {
  return {
    players: [
      { slot: 0, name: "A", bot: false, team: 0, connected: true, host: true },
      { slot: 1, name: "B", bot: false, team: 1, connected: true, host: false },
    ],
    mapSize: 512, water: false, seed: 9, fauna: "none", fog: fog as boolean, running: false, tick: 0, save: null,
  };
}

describe("brouillard de guerre", () => {
  it("dernier paramètre, après la faune ; absent : activé", () => {
    const on = simParams(lobby(true));
    const off = simParams(lobby(false));
    expect(on.length).toBe(4 + 2 * 4 + 2);
    expect(on.at(-1)).toBe(1);
    expect(off.at(-1)).toBe(0);
    expect(simParams(lobby(undefined)).at(-1)).toBe(1);
    expect(fogFromParams(on)).toBe(true);
    expect(fogFromParams(off)).toBe(false);
    // anciennes parties : sans faune ni brouillard, ou faune seule
    expect(fogFromParams(on.slice(0, -2))).toBe(true);
    expect(fogFromParams(on.slice(0, -1))).toBe(true);
  });

  it("sans brouillard, la grille de vision envoyée au joueur est pleine", async () => {
    for (const fog of [true, false]) {
      const s = await Sim.load(wasm);
      s.init(simParams(lobby(fog)));
      s.step([]);
      const f = parseFrame(s.render(0, 0, 512, 512, 2, 0, true));
      expect(f.vis).toBeTruthy();
      const hidden = f.vis!.filter((v) => (v & 1) === 0).length;
      if (fog) expect(hidden).toBeGreaterThan(f.vis!.length / 2);
      else expect(hidden).toBe(0);
    }
  });
});
