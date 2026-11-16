// Contrôleur de partie : connexion au relais, Worker de simulation, entrées (souris, clavier),
// sélection, ordres contextuels, placement de bâtiments, minicarte, alertes et sons.
import * as THREE from "three/webgpu";
import * as Ord from "@supreme/shared/orders.ts";
import { parseFrame, EV, UNIT_WORDS, BUILDING_WORDS, WRECK_WORDS, UF, BClass, Layer, Factory, ORDER_DELAY, hasTech } from "@supreme/shared";
import type { Frame, GameData, ServerMsg, GameStart } from "@supreme/shared";
import { GameScene } from "../render/scene.ts";
import { parseMapInfo, groundHeight, type MapData, DEPOSIT_COLORS } from "../render/terrain.ts";
import { PLAYER_COLORS } from "../models/generator.ts";
import { ui, pushMessage } from "./state.svelte.ts";
import { sfx, setVolume } from "../audio/sound.ts";

const TILE = 256;
const O = Ord.O;
// mode test : pas de rendu 3D (tests automatisés dans Chrome sans GPU)
const NORENDER = new URLSearchParams(location.search).has("norender");

function wsUrl(): string {
  return (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws";
}
function token(): string {
  let t = localStorage.getItem("supreme.token");
  if (!t) {
    t = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem("supreme.token", t);
  }
  return t;
}

export class GameClient {
  ws: WebSocket | null = null;
  worker: Worker | null = null;
  scene: GameScene | null = null;
  frame: Frame | null = null;
  frameTime = 0;
  data: GameData | null = null;
  map: MapData | null = null;
  start: GameStart | null = null;
  selected = new Set<number>();
  groups = new Map<number, number[]>();
  keys = new Set<string>();
  mouse = { x: 0, y: 0, down: false, button: -1, startX: 0, startY: 0, dragging: false, inside: false };
  middle = { active: false, x: 0, y: 0 };
  canvasEl: HTMLElement | null = null;
  selBox: HTMLDivElement | null = null;
  minimap: HTMLCanvasElement | null = null;
  minimapBase: ImageData | null = null;
  reqId = 0;
  pending = new Map<number, (r: unknown) => void>();
  lastTick = 0;
  ghostCells: { x: number; y: number; dir: number; ok: boolean }[] = [];
  ghostStart: { x: number; y: number } | null = null;
  lastUiUpdate = 0;
  lastMinimap = 0;
  fpsCount = 0;
  fpsTime = 0;
  lastClick = { time: 0, id: 0 };
  prevHpCommander = -1;
  lastAttackAlert = 0;
  running = false;
  alertPos: { x: number; z: number } | null = null;
  pingTimer = 0;
  lastGroupKey = { k: -1, t: 0 };
  autoSelect = false;

  // ---------- réseau ----------
  connect(name: string): void {
    ui.name = name;
    localStorage.setItem("supreme.name", name);
    const ws = new WebSocket(wsUrl());
    this.ws = ws;
    ws.onopen = () => {
      ui.connected = true;
      const key = new URLSearchParams(location.search).get("k") ?? localStorage.getItem("supreme.key") ?? "";
      if (key) localStorage.setItem("supreme.key", key);
      ws.send(JSON.stringify({ t: "hello", name, token: token(), key }));
      clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => this.send({ t: "ping", time: performance.now() }), 3000);
    };
    ws.onmessage = (e) => this.onServer(JSON.parse(e.data) as ServerMsg);
    ws.onclose = () => {
      ui.connected = false;
      if (ui.replay) return;
      pushMessage("Connexion perdue, reconnexion…", "alert");
      setTimeout(() => this.connect(name), 2000);
    };
  }

  send(m: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  lobbyAction(action: string, extra: Record<string, unknown> = {}): void {
    this.send({ t: "lobby", action, ...extra });
  }

  chat(text: string): void {
    if (text.trim()) this.send({ t: "chat", text });
  }

  cmd(c: Ord.Cmd): void {
    if (ui.replay || ui.spectator) return;
    this.send({ t: "cmd", tick: this.lastTick + ORDER_DELAY, cmd: c });
  }

  private onServer(m: ServerMsg): void {
    switch (m.t) {
      case "welcome":
        ui.slot = m.slot;
        ui.lobby = m.lobby;
        if (!m.lobby.running) ui.screen = "lobby";
        break;
      case "lobby":
        ui.lobby = m.lobby;
        if (!m.lobby.running && ui.screen !== "game") ui.screen = "lobby";
        break;
      case "start":
        void this.begin(m.start, null);
        break;
      case "snapshot":
        void this.begin(m.start, { tick: m.tick, data: Uint8Array.from(atob(m.data), (c) => c.charCodeAt(0)) });
        break;
      case "tick":
        this.worker?.postMessage({ type: "tick", tick: m.tick, orders: m.orders });
        break;
      case "wait":
        ui.waiting = m.who;
        break;
      case "chat":
        pushMessage(`${m.from} : ${m.text}`, "chat");
        break;
      case "desync":
        pushMessage(`Désynchronisation détectée au tick ${m.tick} : resynchronisation…`, "alert");
        break;
      case "end": {
        const me = this.frame?.players[ui.me];
        const won = !!me && me.team === m.winner;
        ui.gameOver = { winner: m.winner, replay: m.replay, won };
        break;
      }
      case "pong":
        ui.ping = Math.round(performance.now() - m.time);
        break;
      case "error":
        ui.error = m.message;
        break;
    }
  }

  // ---------- démarrage ----------
  async begin(start: GameStart, snap: { tick: number; data: Uint8Array } | null): Promise<void> {
    this.start = start;
    ui.me = start.you;
    ui.spectator = start.you < 0;
    ui.names = start.names;
    ui.gameOver = null;
    ui.screen = "loading";
    this.selected.clear();
    this.autoSelect = !snap;
    this.worker?.terminate();
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e) => this.onWorker(e.data);
    const wasmUrl = new URL("/sim.wasm", location.href).href;
    if (snap) this.worker.postMessage({ type: "snapshot", wasmUrl, tick: snap.tick, data: snap.data }, [snap.data.buffer]);
    else this.worker.postMessage({ type: "init", wasmUrl, params: start.params });
  }

  async loadReplay(url: string): Promise<void> {
    const rep = await (await fetch(url)).json();
    ui.replay = true;
    ui.me = -1;
    ui.spectator = true;
    ui.names = rep.names;
    ui.screen = "loading";
    this.start = { params: rep.params, names: rep.names, you: -1, startTick: 0 };
    this.worker?.terminate();
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e) => this.onWorker(e.data);
    this.worker.postMessage({ type: "loadReplay", wasmUrl: new URL("/sim.wasm", location.href).href, replay: rep });
  }

  setReplaySpeed(s: number): void {
    ui.replaySpeed = s;
    this.worker?.postMessage({ type: "replay", speed: s });
  }

  private async onWorker(m: { type: string; [k: string]: unknown }): Promise<void> {
    switch (m.type) {
      case "ready": {
        this.data = JSON.parse(m.data as string) as GameData;
        ui.data = this.data;
        this.map = parseMapInfo(m.mapInfo as Int32Array, m.heights as Uint8Array);
        if (!this.scene) {
          this.scene = new GameScene(this.canvasEl!);
          await this.scene.init(new URLSearchParams(location.search).has("webgl"));
          ui.backend = this.scene.backend;
        }
        this.scene.setWorld(this.map, this.data);
        const st = this.map.starts[Math.max(0, ui.me)] ?? [this.map.w / 2, this.map.h / 2];
        this.scene.target.set(st[0], 0, st[1] + 4);
        this.scene.distance = 55;
        this.buildMinimapBase();
        ui.screen = "game";
        if (!this.running) {
          this.running = true;
          requestAnimationFrame((t) => this.loop(t));
        }
        break;
      }
      case "frame": {
        const f = parseFrame(m.buf as Int32Array);
        const prevVis = this.frame?.vis;
        if (!f.vis && prevVis) {
          f.vis = prevVis;
          f.visW = this.frame!.visW;
        }
        if (f.vis !== prevVis && f.vis && this.scene?.terrain) this.scene.terrain.updateFog(f.vis);
        this.handleEvents(f);
        this.frame = f;
        this.frameTime = performance.now();
        this.lastTick = f.tick;
        if (this.autoSelect && ui.me >= 0 && f.players[ui.me]) {
          this.autoSelect = false;
          this.selected = new Set([f.players[ui.me].commander]);
          this.updateUi();
        }
        break;
      }
      case "ack":
        this.send({ t: "ack", tick: m.tick, hash: m.hash });
        break;
      case "query":
        this.pending.get(m.reqId as number)?.(m.result);
        this.pending.delete(m.reqId as number);
        break;
      case "error":
        pushMessage(String(m.message), "alert");
        break;
    }
  }

  query<T>(q: string, a: number[]): Promise<T> {
    const id = ++this.reqId;
    return new Promise((res) => {
      this.pending.set(id, res as (r: unknown) => void);
      this.worker?.postMessage({ type: "query", reqId: id, q, a });
    });
  }

  // ---------- boucle d'affichage ----------
  private loop(now: number): void {
    requestAnimationFrame((t) => this.loop(t));
    const sc = this.scene;
    if (!sc || ui.screen !== "game") return;
    const dt = Math.min(0.1, (now - (this.fpsTime || now)) / 1000);
    this.fpsTime = now;
    this.fpsCount++;
    this.panCamera(dt);
    const alpha = this.frame ? Math.min(1, (performance.now() - this.frameTime) / 50) : 0;
    const myTeam = this.frame?.players[ui.me]?.team ?? -1;
    if (!NORENDER) sc.render(this.frame, alpha, ui.me, myTeam, this.selected, dt, ui.spectator);
    // zone vue envoyée au Worker
    const r = sc.viewRect();
    this.worker?.postMessage({ type: "view", x0: Math.floor(r[0]), y0: Math.floor(r[1]), x1: Math.ceil(r[2]), y1: Math.ceil(r[3]), detail: sc.strategic ? 0 : sc.distance > 150 ? 1 : 2, player: ui.me });
    if (now - this.lastUiUpdate > 250) {
      ui.fps = Math.round((this.fpsCount * 1000) / (now - this.lastUiUpdate || 1));
      this.fpsCount = 0;
      this.lastUiUpdate = now;
      this.updateUi();
    }
    if (now - this.lastMinimap > 200) {
      this.lastMinimap = now;
      this.drawMinimap();
    }
  }

  private panCamera(dt: number): void {
    const sc = this.scene!;
    if (ui.chatOpen) return;
    const speed = sc.distance * 1.4 * dt;
    let dx = 0;
    let dz = 0;
    if (this.keys.has("arrowleft") || this.keys.has("q")) dx -= 1;
    if (this.keys.has("arrowright") || this.keys.has("d")) dx += 1;
    if (this.keys.has("arrowup") || this.keys.has("z")) dz -= 1;
    if (this.keys.has("arrowdown") || this.keys.has("s") && !this.keys.has("control")) dz += 1;
    const el = this.canvasEl!;
    if (this.mouse.inside && document.hasFocus() && !this.mouse.down) {
      const m = 6;
      if (this.mouse.x < m) dx -= 1;
      if (this.mouse.x > el.clientWidth - m) dx += 1;
      if (this.mouse.y < m) dz -= 1;
      if (this.mouse.y > el.clientHeight - m) dz += 1;
    }
    if (dx || dz) {
      const c = Math.cos(sc.yaw);
      const s = Math.sin(sc.yaw);
      sc.target.x += (dx * c + dz * s) * speed;
      sc.target.z += (-dx * s + dz * c) * speed;
    }
  }

  // ---------- événements de la simulation ----------
  private handleEvents(f: Frame): void {
    const sc = this.scene;
    if (!sc) return;
    const b = f.buf;
    const cam = sc.target;
    const near = (x: number, z: number) => {
      const d = Math.hypot(x - cam.x, z - cam.z);
      return Math.max(0, 1 - d / (sc.distance * 1.2 + 20));
    };
    const myTeam = f.players[ui.me]?.team ?? -1;
    for (let i = 0, o = f.eventOff; i < f.nEvents; i++, o += 5) {
      const [type, a, c, d, e] = [b[o], b[o + 1], b[o + 2], b[o + 3], b[o + 4]];
      switch (type) {
        case EV.EXPLOSION: {
          const x = a / TILE;
          const z = c / TILE;
          sc.entities.addExplosion(x, z, d / TILE, e);
          sfx.explosion(e + d / 2048, near(x, z));
          break;
        }
        case EV.BEAM: {
          const x0 = a / TILE, z0 = c / TILE, x1 = d / TILE, z1 = e / TILE;
          const y0 = groundHeight(this.map!, x0, z0) + 1.2;
          const y1 = groundHeight(this.map!, x1, z1) + 0.5;
          sc.entities.addBeam(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1), 0xff4040, 0.12);
          sfx.laser(near(x0, z0));
          break;
        }
        case EV.FIRE: {
          const w = this.data!.weapons[a];
          sfx.fire(w?.proj ?? 0, near(c / TILE, d / TILE));
          break;
        }
        case EV.BUILT:
          if (a === ui.me) sfx.built();
          break;
        case EV.RESEARCH:
          if (a === ui.me) {
            sfx.research();
            pushMessage(`Recherche terminée : ${this.data!.techs[c].name}`, "good");
          }
          break;
        case EV.NUKE:
          sfx.nuke();
          pushMessage(a === ui.me ? "Missile stratégique lancé" : "ALERTE : missile stratégique ennemi lancé !", "alert");
          this.alertPos = { x: c / TILE, z: d / TILE };
          break;
        case EV.ORBITAL:
          pushMessage(a === ui.me ? "Frappe orbitale en cours" : "ALERTE : frappe orbitale !", "alert");
          break;
        case EV.ELIMINATED:
          pushMessage(`${ui.names[a] ?? "Joueur"} est éliminé`, a === ui.me ? "alert" : "info");
          break;
        case EV.UNIT_DIED: {
          const owner = e;
          if (owner === ui.me && performance.now() - this.lastAttackAlert > 15000) {
            this.lastAttackAlert = performance.now();
            const x = a / TILE, z = c / TILE;
            if (Math.hypot(x - cam.x, z - cam.z) > sc.distance) {
              pushMessage("Nos unités sont attaquées (Espace pour y aller)", "alert");
              sfx.alert();
              this.alertPos = { x, z };
            }
          }
          break;
        }
        case EV.TELEPORT:
          sfx.teleport(Math.max(near(a / TILE, c / TILE), near(d / TILE, e / TILE)));
          sc.entities.addExplosion(a / TILE, c / TILE, 1.5, 1);
          sc.entities.addExplosion(d / TILE, e / TILE, 1.5, 1);
          break;
        case EV.INTERCEPT:
          sc.entities.addBeam(new THREE.Vector3(a / TILE, groundHeight(this.map!, a / TILE, c / TILE) + 2, c / TILE), new THREE.Vector3(d / TILE, 40, e / TILE), 0x80ffff, 0.6);
          pushMessage("Missile intercepté", "good");
          break;
        case EV.SHIELD_HIT:
          if (Math.random() < 0.3) sc.entities.addExplosion(a / TILE, c / TILE, 0.6, 0);
          break;
      }
    }
    void myTeam;
    // alerte : commandant endommagé
    const me = f.players[ui.me];
    if (me) {
      const cmdId = me.commander;
      for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += UNIT_WORDS) {
        if (b[o] >>> 0 === cmdId) {
          const hp = b[o + 7];
          if (this.prevHpCommander > 0 && hp < this.prevHpCommander - 50) {
            if (performance.now() - this.lastAttackAlert > 8000) {
              this.lastAttackAlert = performance.now();
              pushMessage("Le robot de commandement est attaqué !", "alert");
              sfx.alert();
              this.alertPos = { x: b[o + 2] / TILE, z: b[o + 3] / TILE };
            }
          }
          this.prevHpCommander = hp;
          break;
        }
      }
    }
  }

  // ---------- état pour l'interface ----------
  private updateUi(): void {
    const f = this.frame;
    if (!f || !this.data) return;
    ui.tick = f.tick;
    const me = f.players[Math.max(0, ui.me)];
    if (me && ui.me >= 0) {
      ui.stock = Array.from(me.stock);
      ui.produced = Array.from(me.produced);
      ui.consumed = Array.from(me.consumed);
      ui.powerProd = me.powerProd;
      ui.powerUse = me.powerUse;
      ui.unitCount = me.unitCount;
      ui.research = me.research;
      ui.researchProgress = me.researchProgress;
      ui.researchedLo = me.researchedLo;
      ui.researchedHi = me.researchedHi;
    }
    ui.players = f.players.map((p, i) => ({ name: ui.names[i] ?? `Joueur ${i + 1}`, alive: p.alive, team: p.team, units: p.unitCount, kills: p.kills, losses: p.losses, bot: p.bot, power: p.powerProd }));
    // sélection : retirer les morts, regrouper par type
    const groups = new Map<number, number[]>();
    const alive = new Set<number>();
    for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += UNIT_WORDS) {
      const id = f.buf[o] >>> 0;
      if (!this.selected.has(id)) continue;
      alive.add(id);
      const k = f.buf[o + 1] & 0xff;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(id);
    }
    let selB: typeof ui.selBuilding = null;
    for (const id of this.selected) {
      if (Ord.isBuildingRef(id)) {
        const bw = this.findBuilding(id);
        if (bw) {
          alive.add(id);
          selB = bw;
        } else if (!this.frame || this.scene?.strategic) alive.add(id);
      }
    }
    for (const id of [...this.selected]) if (!alive.has(id)) this.selected.delete(id);
    ui.selUnits = [...groups.entries()].map(([kind, ids]) => ({ kind, count: ids.length, ids })).sort((a, b) => a.kind - b.kind);
    ui.selBuilding = selB;
    ui.canBuild = ui.selUnits.some((g) => this.data!.units[g.kind].buildPower > 0) && ui.me >= 0;
    if (selB) {
      void this.query<Record<string, unknown> | null>("building", [selB.ref]).then((r) => (ui.buildingInfo = r));
    } else ui.buildingInfo = null;
    if (ui.gameOver === null && f.winner !== -1 && ui.replay) ui.gameOver = { winner: f.winner, replay: "", won: false };
  }

  findBuilding(ref: number): { ref: number; kind: number; owner: number; x: number; y: number } | null {
    const f = this.frame;
    if (!f) return null;
    for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      if (f.buf[o] >>> 0 === ref) return { ref, kind: f.buf[o + 1] & 0xff, owner: (f.buf[o + 1] >> 8) & 0xff, x: f.buf[o + 2] & 0xffff, y: (f.buf[o + 2] >>> 16) & 0xffff };
    }
    return null;
  }

  buildingAtTile(tx: number, tz: number): { ref: number; kind: number; owner: number; x: number; y: number; build: number; hp: number } | null {
    const f = this.frame;
    if (!f || !this.data) return null;
    for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      const kind = f.buf[o + 1] & 0xff;
      const def = this.data.buildings[kind];
      const x = f.buf[o + 2] & 0xffff;
      const y = (f.buf[o + 2] >>> 16) & 0xffff;
      if (tx >= x && tx < x + def.w && tz >= y && tz < y + def.h) {
        return { ref: f.buf[o] >>> 0, kind, owner: (f.buf[o + 1] >> 8) & 0xff, x, y, build: f.buf[o + 4], hp: f.buf[o + 3] };
      }
    }
    return null;
  }

  teamOf(p: number): number {
    return this.frame?.players[p]?.team ?? p;
  }

  // ---------- entrées ----------
  attach(el: HTMLElement, selBox: HTMLDivElement): void {
    this.canvasEl = el;
    this.selBox = selBox;
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("pointerdown", (e) => this.onDown(e));
    addEventListener("pointermove", (e) => this.onMove(e));
    addEventListener("pointerup", (e) => this.onUp(e));
    el.addEventListener("pointerenter", () => (this.mouse.inside = true));
    el.addEventListener("pointerleave", () => (this.mouse.inside = false));
    el.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    addEventListener("keydown", (e) => this.onKey(e, true));
    addEventListener("keyup", (e) => this.onKey(e, false));
    addEventListener("blur", () => this.keys.clear());
    const v = Number(localStorage.getItem("supreme.volume") ?? "0.5");
    ui.volume = v;
    setVolume(v);
  }

  private ndc(x: number, y: number): [number, number] {
    const el = this.canvasEl!;
    return [(x / el.clientWidth) * 2 - 1, -(y / el.clientHeight) * 2 + 1];
  }
  groundAt(x: number, y: number): THREE.Vector3 | null {
    const [nx, ny] = this.ndc(x, y);
    return this.scene?.pickGround(nx, ny) ?? null;
  }

  private localXY(e: PointerEvent | WheelEvent): [number, number] {
    const r = this.canvasEl!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private onDown(e: PointerEvent): void {
    sfx.unlock();
    const [x, y] = this.localXY(e);
    this.mouse.x = x;
    this.mouse.y = y;
    if (e.button === 1) {
      this.middle = { active: true, x: e.clientX, y: e.clientY };
      e.preventDefault();
      return;
    }
    this.mouse.down = true;
    this.mouse.button = e.button;
    this.mouse.startX = x;
    this.mouse.startY = y;
    this.mouse.dragging = false;
    if (e.button === 0 && ui.mode === "build") {
      const g = this.groundAt(x, y);
      if (g) this.ghostStart = this.snapBuild(g);
    }
  }

  private onMove(e: PointerEvent): void {
    if (!this.canvasEl) return;
    const [x, y] = this.localXY(e);
    this.mouse.x = x;
    this.mouse.y = y;
    const sc = this.scene;
    if (!sc) return;
    if (this.middle.active) {
      const dx = e.clientX - this.middle.x;
      const dy = e.clientY - this.middle.y;
      this.middle.x = e.clientX;
      this.middle.y = e.clientY;
      sc.yaw -= dx * 0.005;
      sc.tilt += dy * 0.005;
      return;
    }
    if (this.mouse.down && Math.hypot(x - this.mouse.startX, y - this.mouse.startY) > 6) this.mouse.dragging = true;
    if (ui.mode === "build") this.updateGhost();
    if (this.mouse.down && this.mouse.button === 0 && this.mouse.dragging && ui.mode !== "build" && this.selBox) {
      const b = this.selBox;
      b.style.display = "block";
      b.style.left = Math.min(x, this.mouse.startX) + "px";
      b.style.top = Math.min(y, this.mouse.startY) + "px";
      b.style.width = Math.abs(x - this.mouse.startX) + "px";
      b.style.height = Math.abs(y - this.mouse.startY) + "px";
    }
    // déplacement de la caméra au clic droit glissé
    if (this.mouse.down && this.mouse.button === 2 && this.mouse.dragging) {
      const k = sc.distance / (this.canvasEl.clientHeight * 0.6);
      sc.target.x -= e.movementX * k * Math.cos(sc.yaw) + e.movementY * k * Math.sin(sc.yaw);
      sc.target.z -= -e.movementX * k * Math.sin(sc.yaw) + e.movementY * k * Math.cos(sc.yaw);
    }
  }

  private onUp(e: PointerEvent): void {
    if (e.button === 1) {
      this.middle.active = false;
      return;
    }
    if (!this.mouse.down) return;
    this.mouse.down = false;
    if (this.selBox) this.selBox.style.display = "none";
    const [x, y] = this.localXY(e);
    if (!this.canvasEl?.contains(e.target as Node) && !this.mouse.dragging) return;
    if (e.button === 0) {
      if (ui.mode === "build") {
        this.placeBuildings(e.shiftKey);
        return;
      }
      if (ui.mode) {
        this.modeClick(x, y, e.shiftKey);
        return;
      }
      if (this.mouse.dragging) this.boxSelect(this.mouse.startX, this.mouse.startY, x, y, e.shiftKey);
      else this.clickSelect(x, y, e.shiftKey, e.ctrlKey);
    } else if (e.button === 2) {
      if (this.mouse.dragging) return;
      if (ui.mode) {
        this.cancelMode();
        return;
      }
      this.contextCommand(x, y, e.shiftKey);
    }
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const sc = this.scene;
    if (!sc) return;
    const [x, y] = this.localXY(e);
    const before = this.groundAt(x, y);
    const f = Math.exp(Math.sign(e.deltaY) * Math.min(0.5, Math.abs(e.deltaY) / 400));
    sc.distance *= f;
    sc.clampCamera();
    sc.updateCamera();
    // zoom vers le curseur
    const after = this.groundAt(x, y);
    if (before && after) {
      sc.target.x += before.x - after.x;
      sc.target.z += before.z - after.z;
    }
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
    const k = e.key.toLowerCase();
    if (!down) {
      this.keys.delete(k);
      if (k === "control") this.keys.delete("control");
      return;
    }
    if (ui.screen !== "game") return;
    this.keys.add(k);
    if (e.ctrlKey) this.keys.add("control");
    // groupes
    if (/^[0-9]$/.test(k)) {
      const n = Number(k);
      if (e.ctrlKey) {
        this.groups.set(n, [...this.selected]);
        pushMessage(`Groupe ${n} : ${this.selected.size} unités`);
      } else {
        const g = this.groups.get(n);
        if (g) {
          this.selected = new Set(g);
          const now = performance.now();
          if (this.lastGroupKey.k === n && now - this.lastGroupKey.t < 400) this.centerOnSelection();
          this.lastGroupKey = { k: n, t: now };
          this.updateUi();
        }
      }
      e.preventDefault();
      return;
    }
    if (e.ctrlKey && k === "a") {
      this.selectAllArmy();
      e.preventDefault();
      return;
    }
    if (e.ctrlKey) return;
    switch (k) {
      case "escape":
        if (ui.mode) this.cancelMode();
        else if (ui.showResearch || ui.showStats || ui.showHelp) ui.showResearch = ui.showStats = ui.showHelp = false;
        else this.selected.clear();
        break;
      case "a":
        if (this.selected.size) this.setMode("attackMove");
        break;
      case "p":
        if (this.selected.size) this.setMode("patrol");
        break;
      case "x":
        this.stopSelected();
        break;
      case "e":
        if (ui.canBuild) this.setMode("reclaim");
        break;
      case "g":
        if (this.selected.size) this.setMode("assist");
        break;
      case "f":
        this.deploySelected();
        break;
      case "u":
        this.setMode("unload");
        break;
      case "r":
        if (ui.mode === "build") {
          ui.buildDir = (ui.buildDir + 1) % 4;
          this.updateGhost();
        }
        break;
      case "t":
        ui.showResearch = !ui.showResearch;
        break;
      case "tab":
        ui.showStats = !ui.showStats;
        e.preventDefault();
        break;
      case "f1":
      case "h":
        ui.showHelp = !ui.showHelp;
        e.preventDefault();
        break;
      case "enter":
        ui.chatOpen = true;
        e.preventDefault();
        break;
      case " ":
        if (this.alertPos && this.scene) {
          this.scene.target.x = this.alertPos.x;
          this.scene.target.z = this.alertPos.z;
        }
        e.preventDefault();
        break;
      case "c":
        this.centerOnCommander();
        break;
      case "delete":
        if (ui.selBuilding) this.cmd(Ord.cancel(ui.selBuilding.ref));
        break;
      case "+":
      case "pageup":
        if (this.scene) this.scene.distance /= 1.3;
        break;
      case "-":
      case "pagedown":
        if (this.scene) this.scene.distance *= 1.3;
        break;
    }
  }

  setMode(mode: string): void {
    ui.mode = mode;
    if (mode !== "build") this.scene?.hideGhost();
    sfx.click();
  }
  cancelMode(): void {
    ui.mode = "";
    ui.buildKind = -1;
    this.ghostStart = null;
    this.scene?.hideGhost();
  }

  // ---------- sélection ----------
  private ownedUnitAt(x: number, y: number, anyOwner = false): { id: number; kind: number; owner: number } | null {
    const sc = this.scene;
    if (!sc) return null;
    let best = null;
    let bd = 22;
    const p = { x: 0, y: 0 };
    for (const u of sc.entities.screen) {
      if (!u.visible) continue;
      if (!anyOwner && u.owner !== ui.me) continue;
      if (!sc.project(u.x, u.y + 0.4, u.z, p)) continue;
      const r = Math.max(10, (this.data!.units[u.kind].radius / TILE) * 900 / sc.distance);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < Math.max(bd, 0) && d < r + 12) {
        bd = d;
        best = u;
      }
    }
    return best;
  }

  private clickSelect(x: number, y: number, add: boolean, _ctrl: boolean): void {
    const u = this.ownedUnitAt(x, y, true);
    if (!add) this.selected.clear();
    if (u) {
      const now = performance.now();
      if (u.owner === ui.me && this.lastClick.id === u.id && now - this.lastClick.time < 350) {
        // double-clic : toutes les unités de ce type à l'écran
        const el = this.canvasEl!;
        const p = { x: 0, y: 0 };
        for (const v of this.scene!.entities.screen) {
          if (v.owner === ui.me && v.kind === u.kind && this.scene!.project(v.x, v.y, v.z, p) && p.x >= 0 && p.y >= 0 && p.x <= el.clientWidth && p.y <= el.clientHeight) this.selected.add(v.id);
        }
      } else if (add && this.selected.has(u.id)) this.selected.delete(u.id);
      else this.selected.add(u.id);
      this.lastClick = { time: now, id: u.id };
      sfx.click();
    } else {
      const g = this.groundAt(x, y);
      if (g) {
        const b = this.buildingAtTile(Math.floor(g.x), Math.floor(g.z));
        if (b) {
          if (!add) this.selected.clear();
          this.selected.add(b.ref);
          sfx.click();
        }
      }
    }
    this.updateUi();
  }

  private boxSelect(x0: number, y0: number, x1: number, y1: number, add: boolean): void {
    const sc = this.scene!;
    const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
    const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
    if (!add) this.selected.clear();
    const p = { x: 0, y: 0 };
    let n = 0;
    for (const u of sc.entities.screen) {
      if (u.owner !== ui.me) continue;
      if (!sc.project(u.x, u.y + 0.3, u.z, p)) continue;
      if (p.x >= ax && p.x <= bx && p.y >= ay && p.y <= by) {
        this.selected.add(u.id);
        n++;
      }
    }
    if (n) sfx.click();
    this.updateUi();
  }

  selectIds(ids: number[]): void {
    this.selected = new Set(ids);
    this.updateUi();
  }

  private selectAllArmy(): void {
    this.selected.clear();
    for (const u of this.scene?.entities.screen ?? []) {
      const d = this.data!.units[u.kind];
      if (u.owner === ui.me && d.buildPower === 0 && d.weapons.length > 0) this.selected.add(u.id);
    }
    this.updateUi();
  }

  centerOnCommander(): void {
    const f = this.frame;
    const me = f?.players[ui.me];
    if (!f || !me || !this.scene) return;
    for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += UNIT_WORDS) {
      if (f.buf[o] >>> 0 === me.commander) {
        this.scene.target.x = f.buf[o + 2] / TILE;
        this.scene.target.z = f.buf[o + 3] / TILE;
        return;
      }
    }
  }

  centerOnSelection(): void {
    const pts = this.selectedUnits();
    if (!pts.length || !this.scene) return;
    this.scene.target.x = pts.reduce((s, u) => s + u.x, 0) / pts.length / TILE;
    this.scene.target.z = pts.reduce((s, u) => s + u.y, 0) / pts.length / TILE;
  }

  /** Unités sélectionnées (positions en sous-unités, comme la simulation). */
  selectedUnits(): { id: number; kind: number; x: number; y: number }[] {
    const f = this.frame;
    const out: { id: number; kind: number; x: number; y: number }[] = [];
    if (!f) return out;
    for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += UNIT_WORDS) {
      const id = f.buf[o] >>> 0;
      if (this.selected.has(id) && ((f.buf[o + 1] >> 8) & 0xff) === ui.me) out.push({ id, kind: f.buf[o + 1] & 0xff, x: f.buf[o + 2], y: f.buf[o + 3] });
    }
    return out;
  }
  engineers(): number[] {
    return this.selectedUnits().filter((u) => this.data!.units[u.kind].buildPower > 0).map((u) => u.id);
  }

  // ---------- ordres ----------
  private contextCommand(x: number, y: number, queue: boolean): void {
    const g = this.groundAt(x, y);
    if (!g || !this.data || ui.me < 0) return;
    const units = this.selectedUnits();
    const gx = Math.round(g.x * TILE);
    const gy = Math.round(g.z * TILE);
    // usines sélectionnées : point de ralliement
    if (!units.length) {
      if (ui.selBuilding && ui.selBuilding.owner === ui.me) {
        const def = this.data.buildings[ui.selBuilding.kind];
        if (def.cls === BClass.Factory) {
          this.cmd(Ord.rally(ui.selBuilding.ref, gx, gy));
          this.scene?.addMarker(g.x, g.z, 0x7dff9a);
          sfx.confirm();
        }
      }
      return;
    }
    const ids = units.map((u) => u.id);
    const target = this.ownedUnitAt(x, y, true);
    if (target && this.teamOf(target.owner) !== this.teamOf(ui.me)) {
      this.cmd(Ord.target(O.ATTACK, ids, target.id, queue));
      this.scene?.addMarker(g.x, g.z, 0xff5050);
      sfx.confirm();
      return;
    }
    const tb = this.buildingAtTile(Math.floor(g.x), Math.floor(g.z));
    const engs = units.filter((u) => this.data!.units[u.kind].buildPower > 0).map((u) => u.id);
    const others = units.filter((u) => this.data!.units[u.kind].buildPower === 0);
    if (tb && this.teamOf(tb.owner) !== this.teamOf(ui.me)) {
      this.cmd(Ord.target(O.ATTACK, ids, tb.ref, queue));
      this.scene?.addMarker(g.x, g.z, 0xff5050);
      sfx.confirm();
      return;
    }
    if (target && target.owner === ui.me && !ids.includes(target.id)) {
      const td = this.data.units[target.kind];
      if (td.carry > 0) {
        this.cmd(Ord.load(target.id, ids));
        sfx.confirm();
        return;
      }
      // escorte / réparation
      this.cmd(Ord.target(O.ASSIST, ids, target.id, queue));
      sfx.confirm();
      return;
    }
    if (tb && tb.owner === ui.me) {
      const def = this.data.buildings[tb.kind];
      if (def.cls === BClass.Gate) {
        this.cmd(Ord.move(units, (tb.x + 2) * TILE, (tb.y + 2) * TILE, queue, false, false));
        sfx.confirm();
        return;
      }
      if (engs.length && (tb.build < 65536 || tb.hp < def.hp)) {
        this.cmd(Ord.target(O.ASSIST, engs, tb.ref, queue));
        if (others.length) this.cmd(Ord.move(others, gx, gy, queue));
        sfx.confirm();
        return;
      }
    }
    // épave
    if (engs.length && this.frame) {
      const f = this.frame;
      for (let i = 0, o = f.wreckOff; i < f.nWrecks; i++, o += WRECK_WORDS) {
        if (Math.hypot(f.buf[o] / TILE - g.x, f.buf[o + 1] / TILE - g.z) < 1.5) {
          // référence d'épave : on la retrouve côté simulation par position → ordre de recyclage par zone
          void this.reclaimNear(engs, g.x, g.z, queue);
          if (others.length) this.cmd(Ord.move(others, gx, gy, queue));
          return;
        }
      }
    }
    this.cmd(Ord.move(units, gx, gy, queue, false));
    this.scene?.addMarker(g.x, g.z, 0x7dff9a);
    sfx.confirm();
  }

  /** Recyclage : la simulation identifie l'épave la plus proche du point. */
  private async reclaimNear(engs: number[], x: number, z: number, queue: boolean): Promise<void> {
    const ref = await this.query<number>("wreckAt", [Math.round(x * TILE), Math.round(z * TILE)]);
    if (ref) {
      this.cmd(Ord.target(O.RECLAIM, engs, ref, queue));
      this.scene?.addMarker(x, z, 0xffd060);
      sfx.confirm();
    }
  }

  private async modeClick(x: number, y: number, queue: boolean): Promise<void> {
    const g = this.groundAt(x, y);
    if (!g || !this.data) return;
    const gx = Math.round(g.x * TILE);
    const gy = Math.round(g.z * TILE);
    const units = this.selectedUnits();
    const ids = units.map((u) => u.id);
    const mode = ui.mode;
    const tb = this.buildingAtTile(Math.floor(g.x), Math.floor(g.z));
    const tu = this.ownedUnitAt(x, y, true);
    switch (mode) {
      case "attackMove":
        this.cmd(Ord.move(units, gx, gy, queue, true));
        this.scene?.addMarker(g.x, g.z, 0xff9050);
        break;
      case "patrol":
        this.cmd(Ord.point(O.PATROL, ids, gx, gy, queue));
        this.scene?.addMarker(g.x, g.z, 0x50b0ff);
        break;
      case "attackGround":
        this.cmd(Ord.point(O.ATTACK_GROUND, ids, gx, gy, queue));
        this.scene?.addMarker(g.x, g.z, 0xff5050);
        break;
      case "unload":
        this.cmd(Ord.point(O.UNLOAD, ids, gx, gy, queue));
        this.scene?.addMarker(g.x, g.z, 0x50b0ff);
        break;
      case "reclaim": {
        const engs = this.engineers();
        if (tb && tb.owner === ui.me) this.cmd(Ord.target(O.RECLAIM, engs, tb.ref, queue));
        else await this.reclaimNear(engs, g.x, g.z, queue);
        break;
      }
      case "assist":
        if (tu) this.cmd(Ord.target(O.ASSIST, ids, tu.id, queue));
        else if (tb) this.cmd(Ord.target(O.ASSIST, this.engineers(), tb.ref, queue));
        break;
      case "teleport":
      case "jump": {
        const src = units.find((u) => (mode === "teleport" ? this.data!.units[u.kind].key === "commander" : this.data!.units[u.kind].key === "hyper_cruiser"));
        if (src) this.cmd(Ord.special(src.id, gx, gy, tb ? tb.ref : 0));
        break;
      }
      case "launch":
      case "fire":
      case "transfer":
      case "link":
        if (ui.selBuilding) this.cmd(Ord.special(ui.selBuilding.ref, gx, gy, tb ? tb.ref : 0));
        break;
    }
    sfx.confirm();
    if (!queue) this.cancelMode();
  }

  stopSelected(): void {
    const ids = this.selectedUnits().map((u) => u.id);
    if (ids.length) this.cmd(Ord.stop(ids));
  }
  deploySelected(): void {
    const ids = this.selectedUnits().map((u) => u.id);
    if (ids.length) this.cmd(Ord.deploy(ids));
  }

  // ---------- placement des bâtiments ----------
  startBuild(kind: number): void {
    ui.buildKind = kind;
    ui.mode = "build";
    this.ghostStart = null;
    sfx.click();
    this.updateGhost();
  }

  private snapBuild(g: THREE.Vector3): { x: number; y: number } {
    const def = this.data!.buildings[ui.buildKind];
    let x = Math.round(g.x - def.w / 2);
    let y = Math.round(g.z - def.h / 2);
    if (def.deposit !== 0 && this.map) {
      // aligner sur le gisement le plus proche
      let best = null;
      let bd = 6;
      for (const s of this.map.spots) {
        if (def.deposit !== 255 && s.kind !== def.deposit) continue;
        const d = Math.hypot(s.x + 1 - g.x, s.y + 1 - g.z);
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      if (best) {
        x = best.x - Math.floor((def.w - 2) / 2);
        y = best.y - Math.floor((def.h - 2) / 2);
      }
    }
    return { x, y };
  }

  private lineCells(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number; dir: number }[] {
    const def = this.data!.buildings[ui.buildKind];
    const step = def.cls === BClass.Pylon ? 7 : def.w;
    const out: { x: number; y: number; dir: number }[] = [];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const horizFirst = Math.abs(dx) >= Math.abs(dy);
    const sx = Math.sign(dx) || 1;
    const sy = Math.sign(dy) || 1;
    const hdir = sx > 0 ? 0 : 2;
    const vdir = sy > 0 ? 1 : 3;
    const isBelt = def.cls === BClass.Belt;
    if (horizFirst) {
      for (let i = 0; i <= Math.abs(dx); i += step) out.push({ x: a.x + i * sx, y: a.y, dir: isBelt ? (dy !== 0 && i === Math.abs(dx) ? vdir : hdir) : ui.buildDir });
      for (let j = step; j <= Math.abs(dy); j += step) out.push({ x: b.x, y: a.y + j * sy, dir: isBelt ? vdir : ui.buildDir });
    } else {
      for (let j = 0; j <= Math.abs(dy); j += step) out.push({ x: a.x, y: a.y + j * sy, dir: isBelt ? (dx !== 0 && j === Math.abs(dy) ? hdir : vdir) : ui.buildDir });
      for (let i = step; i <= Math.abs(dx); i += step) out.push({ x: a.x + i * sx, y: b.y, dir: isBelt ? hdir : ui.buildDir });
    }
    return out.slice(0, 200);
  }

  private ghostSeq = 0;
  private async updateGhost(): Promise<void> {
    if (ui.mode !== "build" || ui.buildKind < 0 || !this.scene || !this.data) return;
    const g = this.groundAt(this.mouse.x, this.mouse.y);
    if (!g) return;
    const def = this.data.buildings[ui.buildKind];
    const cur = this.snapBuild(g);
    const lineable = def.cls === BClass.Belt || def.cls === BClass.Wall || def.cls === BClass.Pylon;
    const cells = this.mouse.down && this.ghostStart && lineable ? this.lineCells(this.ghostStart, cur) : [{ ...cur, dir: ui.buildDir }];
    const seq = ++this.ghostSeq;
    const args = [ui.me, ui.buildKind];
    for (const c of cells) args.push(c.x, c.y, c.dir);
    const ok = await this.query<boolean[]>("canPlaceMany", args);
    if (seq !== this.ghostSeq || ui.mode !== "build") return;
    this.ghostCells = cells.map((c, i) => ({ ...c, ok: !!ok?.[i] }));
    this.scene.setGhost(ui.buildKind, this.ghostCells);
    const wpn = def.weapon >= 0 ? this.data.weapons[def.weapon] : null;
    this.scene.showRange(cur.x + def.w / 2, cur.y + def.h / 2, wpn ? wpn.range : def.radar || def.shieldR || 0);
  }

  private placeBuildings(shift: boolean): void {
    const engs = this.engineers();
    if (!engs.length) {
      pushMessage("Sélectionnez un ingénieur ou le robot de commandement", "alert");
      sfx.error();
      return;
    }
    const cells = this.ghostCells.filter((c) => c.ok);
    if (!cells.length) {
      sfx.error();
      return;
    }
    cells.forEach((c, i) => this.cmd(Ord.build(engs, ui.buildKind, c.x, c.y, c.dir, shift || i > 0)));
    sfx.confirm();
    this.ghostStart = null;
    if (!shift) {
      const def = this.data!.buildings[ui.buildKind];
      if (!(def.cls === BClass.Belt || def.cls === BClass.Wall || def.cls === BClass.Pylon || def.cls === BClass.Inserter)) this.cancelMode();
      else this.updateGhost();
    }
    this.scene?.showRange(0, 0, 0);
  }

  // ---------- usines et bâtiments ----------
  queueUnit(kind: number, delta: number): void {
    if (ui.selBuilding) this.cmd(Ord.factoryQueue(ui.selBuilding.ref, kind, delta));
  }
  toggleRepeat(on: boolean): void {
    if (ui.selBuilding) this.cmd(Ord.factoryRepeat(ui.selBuilding.ref, on));
  }
  setRecipe(r: number): void {
    if (ui.selBuilding) this.cmd(Ord.setRecipe(ui.selBuilding.ref, r));
  }
  research(t: number): void {
    this.cmd(Ord.research(t));
    sfx.confirm();
  }
  toggleBuilding(): void {
    if (ui.selBuilding) this.cmd(Ord.toggle(ui.selBuilding.ref));
  }
  cancelBuilding(): void {
    if (ui.selBuilding) this.cmd(Ord.cancel(ui.selBuilding.ref));
  }
  surrender(): void {
    this.cmd(Ord.surrender());
  }

  // ---------- minicarte ----------
  attachMinimap(c: HTMLCanvasElement): void {
    if (this.minimap === c) return;
    this.minimap = c;
    const go = (e: PointerEvent) => {
      if (!this.map || !this.scene) return;
      const r = c.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * this.map.w;
      const z = ((e.clientY - r.top) / r.height) * this.map.h;
      if (e.button === 2) {
        const units = this.selectedUnits();
        if (units.length) {
          this.cmd(Ord.move(units, x * TILE, z * TILE, e.shiftKey));
          sfx.confirm();
        }
        return;
      }
      this.scene.target.x = x;
      this.scene.target.z = z;
    };
    c.addEventListener("pointerdown", (e) => {
      go(e);
      const move = (ev: PointerEvent) => ev.buttons & 1 && go(ev);
      const up = () => {
        removeEventListener("pointermove", move);
        removeEventListener("pointerup", up);
      };
      addEventListener("pointermove", move);
      addEventListener("pointerup", up);
    });
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    this.buildMinimapBase();
  }

  private buildMinimapBase(): void {
    const c = this.minimap;
    const m = this.map;
    if (!c || !m) return;
    const S = c.width;
    const img = new ImageData(S, S);
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const x = Math.floor((i / S) * m.w);
        const z = Math.floor((j / S) * m.h);
        const h = m.heights[z * m.w + x];
        let r: number, g: number, b: number;
        if (h < m.waterLevel) [r, g, b] = [30, 70, 105];
        else if (h - m.waterLevel < 5) [r, g, b] = [150, 140, 100];
        else if (h > 205) [r, g, b] = [190, 190, 195];
        else [r, g, b] = [60 + h * 0.3, 90 + h * 0.25, 50 + h * 0.15];
        const k = (j * S + i) * 4;
        img.data[k] = r;
        img.data[k + 1] = g;
        img.data[k + 2] = b;
        img.data[k + 3] = 255;
      }
    }
    for (const s of m.spots) {
      const col = new THREE.Color(DEPOSIT_COLORS[s.kind]);
      const i = Math.floor((s.x / m.w) * S);
      const j = Math.floor((s.y / m.h) * S);
      for (let d = 0; d < 4; d++) {
        const k = ((j + (d >> 1)) * S + i + (d & 1)) * 4;
        img.data[k] = col.r * 255;
        img.data[k + 1] = col.g * 255;
        img.data[k + 2] = col.b * 255;
      }
    }
    this.minimapBase = img;
  }

  private drawMinimap(): void {
    const c = this.minimap;
    const m = this.map;
    const f = this.frame;
    if (!c || !m || !f || !this.minimapBase) return;
    const ctx = c.getContext("2d")!;
    ctx.putImageData(this.minimapBase, 0, 0);
    const S = c.width;
    const k = S / m.w;
    // brouillard
    if (f.vis && !ui.spectator) {
      const vw = f.visW;
      ctx.fillStyle = "rgba(5,8,12,0.55)";
      const cs = (S / vw);
      for (let j = 0; j < vw; j++) {
        for (let i = 0; i < vw; i++) {
          const v = f.vis[j * vw + i];
          if (!(v & 1)) {
            ctx.globalAlpha = v & 8 ? 0.35 : 0.75;
            ctx.fillRect(i * cs, j * cs, cs + 0.5, cs + 0.5);
          }
        }
      }
      ctx.globalAlpha = 1;
    }
    const myTeam = f.players[ui.me]?.team ?? -1;
    const vis = f.vis;
    const vw = f.visW;
    const seen = (x: number, z: number, bit: number) => ui.spectator || !vis || (vis[Math.min(vw - 1, (z / 4) | 0) * vw + Math.min(vw - 1, (x / 4) | 0)] & bit) !== 0;
    for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      const owner = (f.buf[o + 1] >> 8) & 0xff;
      const kind = f.buf[o + 1] & 0xff;
      const def = this.data!.buildings[kind];
      const x = f.buf[o + 2] & 0xffff;
      const z = (f.buf[o + 2] >>> 16) & 0xffff;
      if (this.teamOf(owner) !== myTeam && !seen(x, z, 9)) continue;
      ctx.fillStyle = "#" + PLAYER_COLORS[owner % 8].toString(16).padStart(6, "0");
      ctx.fillRect(x * k, z * k, Math.max(1.5, def.w * k), Math.max(1.5, def.h * k));
    }
    for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += UNIT_WORDS) {
      const owner = (f.buf[o + 1] >> 8) & 0xff;
      const x = f.buf[o + 2] / TILE;
      const z = f.buf[o + 3] / TILE;
      const enemy = this.teamOf(owner) !== myTeam;
      if (enemy && !seen(x, z, 3)) continue;
      const kind = f.buf[o + 1] & 0xff;
      const big = this.data!.units[kind].tier === 6 || kind === 0;
      ctx.fillStyle = this.selected.has(f.buf[o] >>> 0) ? "#ffffff" : "#" + PLAYER_COLORS[owner % 8].toString(16).padStart(6, "0");
      const s = big ? 4 : 2;
      ctx.fillRect(x * k - s / 2, z * k - s / 2, s, s);
    }
    // cadre de la caméra
    const r = this.scene!.viewRect();
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 1;
    ctx.strokeRect(r[0] * k, r[1] * k, (r[2] - r[0]) * k, (r[3] - r[1]) * k);
  }

  setVolume(v: number): void {
    ui.volume = v;
    setVolume(v);
    localStorage.setItem("supreme.volume", String(v));
  }

  // utilitaires pour l'interface
  techAvailable(t: number): boolean {
    const me = this.frame?.players[ui.me];
    if (!me || !this.data) return false;
    return !hasTech(me, t) && this.data.techs[t].prereq.every((p) => hasTech(me, p));
  }
  unitLayerName(l: number): string {
    return ["Terre", "Aéroglisseur", "Mer", "Sous-marin", "Air"][l] ?? "";
  }
  factoryName(f: number): string {
    return ["", "terrestre", "aérienne", "navale", "expérimentale"][f] ?? "";
  }
}

export const client = new GameClient();
export { Layer, Factory, UF };
