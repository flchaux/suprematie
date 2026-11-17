// Partie en cours : relais lockstep, copie de référence de la simulation, bots, hash, replays,
// sauvegardes (à la demande et automatiques) et reprise d'une sauvegarde.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { Sim, pack, validCmd, parseBotDump, ORDER_DELAY, HASH_EVERY, simParams } from "@supreme/shared";
import type { LobbyState, GameStart, GameData, Cmd, SaveMeta, BotView, StatSample } from "@supreme/shared";
import { createBot, type Bot, type MapInfo } from "./bots/index.ts";
import { writeSave, pruneAutosaves, type SaveData } from "./saves.ts";
import { StatsCalc, STATS_EVERY, visibleSample } from "./stats.ts";

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
  onSaved?(meta: SaveMeta, by: string): void;
  log(...a: unknown[]): void;
}

const BOT_EVERY = 10;
const MAX_LEAD = 30; // ticks d'avance maximum sur le client le plus lent (1,5 s)
const AUTOSAVE_EVERY = 6000; // ticks (5 minutes de jeu)
const AUTOSAVES_KEPT = 5;

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
  /** identifiant de la sauvegarde automatique de cette partie (une seule, remplacée à chaque fois) */
  autoId = "auto-" + new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  lastSave = 0;
  /** relevés statistiques (toutes les STATS_EVERY ticks, plus un relevé final) */
  history: StatSample[] = [];
  statsCalc!: StatsCalc;

  constructor(lobby: LobbyState, hooks: GameHooks, wasmPath: string, dataDir: string) {
    this.lobby = JSON.parse(JSON.stringify(lobby));
    this.params = simParams(lobby);
    this.names = lobby.players.map((p) => p.name);
    this.hooks = hooks;
    this.wasmPath = wasmPath;
    this.dataDir = dataDir;
  }

  /** Démarre la partie ; avec une sauvegarde, reprend exactement où elle s'était arrêtée. */
  async start(save?: SaveData): Promise<GameStart> {
    this.sim = await Sim.load(readFileSync(this.wasmPath));
    if (save) {
      this.params = save.params;
      if (!this.sim.restore(Buffer.from(save.snapshot, "base64"))) throw new Error("sauvegarde incompatible avec cette version de la simulation");
      this.tick = this.sim.tick();
      this.replay = save.replay;
      this.pending = save.pending.filter((p) => validCmd(p.cmd));
      this.history = save.stats ?? [];
    } else {
      this.sim.init(this.params);
    }
    this.data = JSON.parse(this.sim.dataJson());
    this.statsCalc = new StatsCalc(this.data);
    const info = this.sim.mapInfo();
    const heights = this.sim.mapHeights();
    const map: MapInfo = { w: info[0], h: info[1], waterLevel: info[2], starts: [], spots: [], heights };
    let o = 4;
    for (let i = 0; i < info[3]; i++, o += 2) map.starts.push([info[o], info[o + 1]]);
    const ns = info[o++];
    for (let i = 0; i < ns; i++, o += 3) map.spots.push({ kind: info[o], x: info[o + 1], y: info[o + 2] });
    for (const p of this.lobby.players) {
      if (p.bot) {
        const bot = createBot({ slot: p.slot, personality: p.personality ?? "adaptive", aix: p.aix ?? 100, level: p.level ?? "normal", sim: this.sim, data: this.data, map });
        const st = save?.bots.find((b) => b.slot === p.slot);
        if (st && bot.load) {
          try {
            bot.load(Buffer.from(st.state, "base64"));
          } catch (e) {
            // état illisible (IA modifiée depuis) : l'IA repart de zéro sur la partie en cours
            this.hooks.log("état d'IA non repris", p.slot, e);
          }
        }
        this.bots.push({ slot: p.slot, bot, ms: 0 });
      }
    }
    this.lastSave = this.tick;
    this.startedAt = Date.now() - this.tick * 50;
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
    peer.send({ t: "snapshot", tick: this.tick - 1, data, start: this.startInfo(peer.slot), stats: this.history.map((s) => this.visibleTo(s, peer.slot)) });
  }

  /** Relevé tel qu'un participant peut le voir : son équipe seulement pendant la partie, tout pour un spectateur. */
  visibleTo(s: StatSample, slot: number): StatSample {
    return this.ended ? s : visibleSample(s, this.lobby.players.map((p) => p.team), slot);
  }

  /** Ajoute un relevé à l'historique et l'envoie à chacun (filtré selon son équipe). */
  recordStats(view: BotView, send: boolean): void {
    const last = this.history[this.history.length - 1];
    if (last && last.tick >= view.tick) return;
    const sample = this.statsCalc.sample(view);
    this.history.push(sample);
    if (!send) return;
    for (const p of this.hooks.peers()) if (p.connected) p.send({ t: "stats", sample: this.visibleTo(sample, p.slot) });
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
    let view: BotView | null = null;
    if (t % STATS_EVERY === 0) {
      view = parseBotDump(this.sim.botDump());
      this.recordStats(view, true);
    }
    // bots
    if (t % BOT_EVERY === 0 && this.bots.length) {
      const t0 = performance.now();
      view ??= parseBotDump(this.sim.botDump());
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
    if (this.tick - this.lastSave >= AUTOSAVE_EVERY) this.save("", true);
    if (t % 20 === 0) {
      const winner = this.sim.winner();
      if (winner !== -1) this.finish(winner);
    }
  }

  finish(winner: number): void {
    if (this.ended) return;
    this.recordStats(parseBotDump(this.sim.botDump()), false);
    this.ended = true;
    if (this.timer) clearInterval(this.timer);
    const dir = this.dataDir + "/replays";
    mkdirSync(dir, { recursive: true });
    const name = `partie-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    writeFileSync(`${dir}/${name}`, JSON.stringify(this.replayData()));
    this.hooks.log("fin de partie, équipe gagnante", winner, "replay", name);
    this.hooks.onEnd(winner, name);
  }

  /** Sauvegarde l'état courant (entre deux ticks). Renvoie le résumé, ou null en cas d'échec. */
  save(by: string, auto: boolean): SaveMeta | null {
    if (this.ended && !auto) return null;
    try {
      const now = new Date();
      const min = Math.floor(this.tick / 1200);
      const humans = this.lobby.players.filter((p) => !p.bot).map((p) => p.name);
      const id = auto ? this.autoId : "s-" + now.toISOString().replace(/[^0-9]/g, "").slice(0, 17);
      const meta: SaveMeta = {
        id,
        name: `${auto ? "Automatique" : "Sauvegarde"} · ${humans.join(", ") || "IA seules"} · ${min} min`,
        savedAt: now.toISOString(),
        tick: this.tick,
        auto,
        mapSize: this.lobby.mapSize,
        water: this.lobby.water,
        seed: this.lobby.seed,
        players: this.lobby.players.map((p) => ({ name: p.name, bot: p.bot, team: p.team, personality: p.personality, aix: p.aix, level: p.level })),
      };
      const bots = this.bots.filter((b) => b.bot.save).map((b) => ({ slot: b.slot, state: Buffer.from(b.bot.save!()).toString("base64") }));
      const data: SaveData = { version: 1, meta, params: this.params, snapshot: Buffer.from(this.sim.snapshot()).toString("base64"), bots, pending: this.pending, replay: this.replay, stats: this.history };
      const dir = this.dataDir + "/saves";
      writeSave(dir, data);
      if (auto) pruneAutosaves(dir, AUTOSAVES_KEPT);
      this.lastSave = this.tick;
      this.hooks.log(auto ? "sauvegarde automatique" : "sauvegarde", id, "tick", this.tick, by);
      this.hooks.onSaved?.(meta, by);
      return meta;
    } catch (e) {
      this.hooks.log("échec de la sauvegarde", e);
      return null;
    }
  }

  replayData(): unknown {
    return { version: 1, params: this.params, names: this.names, ticks: this.tick, orders: this.replay, stats: this.history };
  }

  stop(): void {
    this.ended = true;
    if (this.timer) clearInterval(this.timer);
  }

  stats(): unknown {
    return { tick: this.tick, simMsPerTick: this.simMs / Math.max(1, this.tick), botMsPerTick: this.botMs / Math.max(1, this.tick) };
  }
}
