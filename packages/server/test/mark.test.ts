// Pings : relayés à l'équipe seulement, bornés à la carte, limités en fréquence.
import { describe, it, expect } from "vitest";
import { MARK_EVERY_MS, markAllowed, markPeers, markPoint } from "../src/mark.ts";

describe("ping sur la carte", () => {
  it("ne va qu'aux joueurs de l'équipe", () => {
    const teams = [0, 0, 1];
    const peers = [{ slot: 0 }, { slot: 1 }, { slot: 2 }, { slot: -1 }];
    expect(markPeers(peers[0], peers, (s) => teams[s]).map((p) => p.slot)).toEqual([0, 1]);
    expect(markPeers(peers[2], peers, (s) => teams[s]).map((p) => p.slot)).toEqual([2]);
    expect(markPeers(peers[3], peers, (s) => teams[s])).toEqual([]);
  });
  it("refuse les points invalides et borne les autres à la carte", () => {
    expect(markPoint(Number.NaN, 3, 512)).toBeNull();
    expect(markPoint("3", 3, 512)).toBeNull();
    expect(markPoint(-5, 900, 512)).toEqual({ x: 0, z: 512 });
  });
  it("limite la fréquence, et l'interdit aux spectateurs", () => {
    const p = { slot: 0 };
    expect(markAllowed(p, 1000)).toBe(true);
    expect(markAllowed(p, 1000 + MARK_EVERY_MS - 1)).toBe(false);
    expect(markAllowed(p, 1000 + MARK_EVERY_MS)).toBe(true);
    expect(markAllowed({ slot: -1 }, 5000)).toBe(false);
  });
});
