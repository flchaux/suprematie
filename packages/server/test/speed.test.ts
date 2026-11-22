// Vitesse de jeu : réglable seulement en solo (un seul joueur humain), parmi GAME_SPEEDS.
import { describe, it, expect } from "vitest";
import type { LobbyState } from "@supreme/shared";
import { Game, type GameHooks, type Peer } from "../src/game.ts";

const peer = (slot: number): Peer => ({ slot, name: "p" + slot, connected: true, ackTick: 0, send: () => {} });
function game(humans: number): { g: Game; said: unknown[] } {
  const said: unknown[] = [];
  const hooks: GameHooks = { broadcast: (m) => said.push(m), peers: () => [], onEnd: () => {}, log: () => {} };
  const players: LobbyState["players"] = [];
  for (let i = 0; i < humans; i++) players.push({ slot: i, name: "H" + i, bot: false, team: i, connected: true, host: i === 0 });
  players.push({ slot: humans, name: "IA", bot: true, team: 9, connected: true, host: false, personality: "rush", level: "normal" });
  const lobby: LobbyState = { players, mapSize: 512, water: false, seed: 3, running: true, tick: 0, save: null };
  return { g: new Game(lobby, hooks, "", ""), said };
}

describe("vitesse de jeu", () => {
  it("solo contre l'IA : accordée et annoncée, valeurs de la liste seulement", () => {
    const { g, said } = game(1);
    expect(g.setSpeed(peer(0), 2)).toBe(true);
    expect(g.speed).toBe(2);
    expect(said).toEqual([{ t: "speed", speed: 2, by: "p0" }]);
    expect(g.setSpeed(peer(0), 7)).toBe(false);
    expect(g.setSpeed(peer(-1), 1)).toBe(false); // spectateur
    expect(g.speed).toBe(2);
  });
  it("deux joueurs humains : refusée", () => {
    const { g } = game(2);
    expect(g.setSpeed(peer(0), 2)).toBe(false);
    expect(g.speed).toBe(1);
  });
});

describe("pause (vitesse 0)", () => {
  it("solo : pause et reprise à la vitesse d'avant, annoncées", () => {
    const { g, said } = game(1);
    g.setSpeed(peer(0), 3);
    said.length = 0;
    expect(g.setSpeed(peer(0), 0)).toBe(true);
    expect(g.speed).toBe(0);
    expect(said).toEqual([{ t: "speed", speed: 0, by: "p0", resume: 3 }]);
    expect(g.setSpeed(peer(0), 0)).toBe(true); // déjà en pause : rien de plus
    expect(said.length).toBe(1);
    expect(g.setSpeed(peer(0), 3)).toBe(true);
    expect(g.speed).toBe(3);
  });
  it("à plusieurs : l'hôte seul met en pause et reprend, sans changer la vitesse", () => {
    const { g, said } = game(2);
    expect(g.setSpeed(peer(1), 0, false)).toBe(false);
    expect(g.speed).toBe(1);
    expect(g.setSpeed(peer(0), 0, true)).toBe(true);
    expect(said).toEqual([{ t: "speed", speed: 0, by: "p0", resume: 1 }]);
    expect(g.setSpeed(peer(1), 1, false)).toBe(false); // un autre joueur ne reprend pas
    expect(g.setSpeed(peer(0), 2, true)).toBe(false); // ni l'hôte à une autre vitesse
    expect(g.setSpeed(peer(0), 1, true)).toBe(true);
    expect(g.speed).toBe(1);
    expect(g.setSpeed(peer(0), 2, true)).toBe(false); // hors pause, la vitesse reste solo
  });
});
