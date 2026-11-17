// Partie en cours : relais lockstep, copie de référence de la simulation, bots, hash, replays.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { Sim, pack, validCmd, parseBotDump, ORDER_DELAY, HASH_EVERY, simParams } from "@supreme/shared";
import type { LobbyState, GameStart, GameData, Cmd } from "@supreme/shared";
import { createBot, type Bot, type MapInfo } from "./bots/index.ts";

export interface Peer {
  slot: number; // -1 = spectateur
  name: string;
  send(msg: unknown): void;
  connected: boolean;
  ackTick: number;
}

export interface GameHooks {
  broadcast(msg: unknown): void;
  peers(): Peer[];
  onEnd(winner: number, replayFile: string): void;
  log(...a: unknown[]): void;
}

const BOT_EVERY = 10;
const MAX_LEAD = 30; // ticks d'avance maximum sur le client le plus lent (1,5 s)

export class Game {
  sim!: Sim;
  data!: GameData;
  tick = 0; // prochain tick à produire
  params: number[];
  names: string[];
  lobby: LobbyState;
  pending: { tick: number; player: number; cmd: Cmd }[] = [];
  replay: [number, number[]][] = [];
  hashes = new Map<number, number>();
  bots: { slot: number; bot: Bot; ms: number }[] = [];
  timer: NodeJS.Timeout | null = null;
  ended = false;
  waitingSince = 0;
  lastWaitMsg = 0;
  botMs = 0;
  simMs = 0;
  startedAt = Date.now();
  hooks: GameHooks;
  wasmPath: string;
  dataDir: string;

  constructor(lobby: LobbyState, hooks: GameHooks, wasmPath: string, dataDir: string) {
    this.lobby = JSON.parse(JSON.stringify(lobby));
    this.params = simParams(lobby);
    this.names = lobby.players.map((p) => p.name);
    this.hooks = hooks;
    this.wasmPath = wasmPath;
    this.dataDir = dataDir;
  }

  async start(): Promise<GameStart> {
    this.sim = await Sim.load(readFileSync(this.wasmPath));
    this.sim.init(this.params);
    this.data = JSON.parse(this.sim.dataJson());
    const info = this.sim.mapInfo();
    const heights = this.sim.mapHeights();
    const map: MapInfo = { w: info[0], h: info[1], waterLevel: info[2], starts: [], spots: [], heights };
    let o = 4;
    for (let i = 0; i < info[3]; i++, o += 2) map.starts.push([info[o], info[o + 1]]);
    const ns = info[o++];
    for (let i = 0; i < ns; i++, o += 3) map.spots.push({ kind: info[o], x: info[o + 1], y: info[o + 2] });
    for (const p of this.lobby.players) {
      if (p.bot) {
        this.bots.push({ slot: p.slot, bot: createBot({ slot: p.slot, personality: p.personality ?? "adaptive", aix: p.aix ?? 100, level: p.level ?? "normal", sim: this.sim, data: this.data, map }), ms: 0 });
      }
    }
    this.startedAt = Date.now();
    this.timer = setInterval(() => this.loop(), 10);
    return this.startInfo(-1);
  }

  startInfo(you: number): GameStart {
    return { params: this.params, names: this.names, you, startTick: 0 };
  }

  /** Ordre reçu d'un joueur (ou d'un bot). */
  submit(player: number, wantTick: number, cmd: unknown): void {
    if (this.ended || !validCmd(cmd)) return;
    const t = Math.max(this.tick, Math.min(wantTick | 0, this.tick + 20));
    this.pending.push({ tick: t, player, cmd });
  }

  ack(peer: Peer, tick: number, hash?: number): void {
    peer.ackTick = Math.max(peer.ackTick, tick | 0);
    if (hash !== undefined && peer.slot >= -1) {
      const mine = this.hashes.get(tick);
      if (mine !== undefined && mine !== hash >>> 0) {
        this.reportDesync(peer, tick, hash >>> 0, mine);
      }
    }
  }

  reportDesync(peer: Peer, tick: number, theirs: number, mine: number): void {
    const dir = this.dataDir + "/desync";
    mkdirSync(dir, { recursive: true });
    const file = `${dir}/desync-${Date.now()}-${peer.name.replace(/[^a-z0-9]/gi, "_")}.json`;
    writeFileSync(file, JSON.stringify({ tick, player: peer.name, slot: peer.slot, clientHash: theirs, serverHash: mine, params: this.params, orders: this.replay, snapshotTick: this.tick - 1, snapshot: Buffer.from(this.sim.snapshot()).toString("base64") }));
    this.hooks.log("DÉSYNCHRONISATION", peer.name, "tick", tick, "->", file);
    peer.send({ t: "desync", tick });
    this.sendSnapshot(peer);
  }

  sendSnapshot(peer: Peer): void {
    const data = Buffer.from(this.sim.snapshot()).toString("base64");
    peer.ackTick = this.tick - 1;
    peer.send({ t: "snapshot", tick: this.tick - 1, data, start: this.startInfo(peer.slot) });
  }

  private loop(): void {
    if (this.ended) return;
    const due = this.startedAt + this.tick * 50;
    const now = Date.now();
    if (now < due) return;
    // attendre le client le plus lent
    const peers = this.hooks.peers().filter((p) => p.connected && p.slot >= 0);
    const late = peers.filter((p) => this.tick - p.ackTick > MAX_LEAD);
    if (late.length > 0) {
      if (now - this.lastWaitMsg > 1000) {
        this.lastWaitMsg = now;
        this.hooks.broadcast({ t: "wait", who: late.map((p) => p.name) });
      }
      if (!this.waitingSince) this.waitingSince = now;
      // un client bloqué plus de 20 s n'est plus attendu (il se resynchronisera)
      if (now - this.waitingSince > 20000) for (const p of late) p.ackTick = this.tick;
      this.startedAt += now - due; // décaler l'horloge pendant l'attente
      return;
    }
    if (this.waitingSince) {
      this.waitingSince = 0;
      this.hooks.broadcast({ t: "wait", who: [] });
    }
    // rattraper au plus 3 ticks d'un coup
    for (let k = 0; k < 3 && Date.now() >= this.startedAt + this.tick * 50 && !this.ended; k++) this.produceTick();
  }

  private produceTick(): void {
    const t = this.tick;
    // bots
    if (t % BOT_EVERY === 0 && this.bots.length) {
      const t0 = performance.now();
      const view = parseBotDump(this.sim.botDump());
      for (const b of this.bots) {
        if (!view.players[b.slot]?.alive) continue;
        const b0 = performance.now();
        try {
          for (const cmd of b.bot.think(view)) this.submit(b.slot, t + ORDER_DELAY, cmd);
        } catch (e) {
          this.hooks.log("erreur bot", b.slot, e);
        }
        b.ms += performance.now() - b0;
      }
      this.botMs += performance.now() - t0;
    }
    const orders: number[] = [];
    const keep: typeof this.pending = [];
    for (const p of this.pending) {
      if (p.tick <= t) pack(p.player, p.cmd, orders);
      else keep.push(p);
    }
    this.pending = keep;
    this.hooks.broadcast({ t: "tick", tick: t, orders });
    if (orders.length) this.replay.push([t, orders]);
    const s0 = performance.now();
    const h = this.sim.step(orders);
    this.simMs += performance.now() - s0;
    if (t % HASH_EVERY === 0) {
      this.hashes.set(t, h);
      this.hashes.delete(t - HASH_EVERY * 50);
    }
    this.tick = t + 1;
    if (t % 20 === 0) {
      const winner = this.sim.winner();
      if (winner !== -1) this.finish(winner);
    }
  }

  finish(winner: number): void {
    if (this.ended) return;
    this.ended = true;
    if (this.timer) clearInterval(this.timer);
    const dir = this.dataDir + "/replays";
    mkdirSync(dir, { recursive: true });
    const name = `partie-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    writeFileSync(`${dir}/${name}`, JSON.stringify(this.replayData()));
    this.hooks.log("fin de partie, équipe gagnante", winner, "replay", name);
    this.hooks.onEnd(winner, name);
  }

  replayData(): unknown {
    return { version: 1, params: this.params, names: this.names, ticks: this.tick, orders: this.replay };
  }

  stop(): void {
    this.ended = true;
    if (this.timer) clearInterval(this.timer);
  }

  stats(): unknown {
    return { tick: this.tick, simMsPerTick: this.simMs / Math.max(1, this.tick), botMsPerTick: this.botMs / Math.max(1, this.tick) };
  }
}
