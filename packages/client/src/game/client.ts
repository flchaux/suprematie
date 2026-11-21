// Contrôleur de partie : connexion au relais, Worker de simulation, entrées (souris, clavier),
// sélection, ordres contextuels, placement de bâtiments, minicarte, alertes et sons.
import * as THREE from "three/webgpu";
import * as Ord from "@supreme/shared/orders.ts";
import { cursorCss, type CursorKind } from "../ui/cursors.ts";
import { FLOOR_H } from "../render/entities.ts";
import { parseFrame, EV, UNIT_WORDS, BUILDING_WORDS, WRECK_WORDS, UF, BClass, Layer, Factory, ORDER_DELAY, GAME_SPEEDS, hasTech, realPlayers, fogFromParams, smeltRecipe } from "@supreme/shared";
import type { Frame, GameData, ServerMsg, GameStart, PowerZones } from "@supreme/shared";
import { GameScene } from "../render/scene.ts";
import { DEAD_COLOR } from "../render/power.ts";
import type { GfxSettings } from "../render/gfx.ts";
import { parseMapInfo, groundHeight, HSCALE, type MapData, DEPOSIT_COLORS } from "../render/terrain.ts";
import { ownerColor, ownerHex } from "./colors.ts";
import { ui, pushMessage, hasTechUI, type HarvestInfo } from "./state.svelte.ts";
import { say, setVoiceEnabled } from "../audio/voice.ts";
import { sfx, setVolume } from "../audio/sound.ts";
import { initMusic, setMusicVolume } from "../audio/music.ts";
import { keymap, kb, keysChanged, initLayout, keyOf } from "./keys.svelte.ts";
import { groupKey, digitOf, isModifierCode, actionDef } from "./keymap.ts";
import { BUILD_CATS, factoryUnitKinds } from "./catalog.ts";
import { PlanTool, plans } from "./plans.svelte.ts";
import { isMachine, machineRow } from "./machineRow.ts";
import * as Belts from "./belts.ts";

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
  /** unités sélectionnées qui nous appartiennent (mis à jour par updateUi) */
  private selOwn = new Set<number>();
  groups = new Map<number, number[]>();
  /** Touches physiques enfoncées (KeyboardEvent.code). */
  keys = new Set<string>();
  mouse = { x: 0, y: 0, down: false, button: -1, startX: 0, startY: 0, dragging: false, inside: false };
  middle = { active: false, x: 0, y: 0 };
  canvasEl: HTMLElement | null = null;
  selBox: HTMLDivElement | null = null;
  /** zones électriques de l'équipe (dernière requête) */
  zones: PowerZones | null = null;
  lastZonesQuery = 0;
  minimap: HTMLCanvasElement | null = null;
  minimapBase: ImageData | null = null;
  reqId = 0;
  pending = new Map<number, (r: unknown) => void>();
  lastTick = 0;
  /** `twins` : cases de bord collées à une future machine jumelle (liseré vert, voir sim twins::twin_preview) */
  ghostCells: { x: number; y: number; dir: number; ok: boolean; floor?: number; twins?: number }[] = [];
  ghostStart: { x: number; y: number } | null = null;
  lastUiUpdate = 0;
  lastMinimap = 0;
  fpsCount = 0;
  fpsTime = 0;
  lastClick = { time: 0, id: 0 };
  running = false;
  alertPos: { x: number; z: number } | null = null;
  lastStarveAlert = -1e9;
  lastFuelAlert = 0;
  pingTimer = 0;
  lastGroupKey = { k: -1, t: 0 };
  autoSelect = false;
  /** Marque-pages de caméra (F2..F4 ; Maj pour enregistrer). */
  bookmarks: ({ x: number; z: number; distance: number } | null)[] = [null, null, null];
  lastIdleEngineer = 0;
  /** Outils « Copier » / « Coller » des plans. */
  plans = new PlanTool(this);

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

  /** Partie solo : un seul joueur humain (la vitesse de jeu n'est réglable que dans ce cas). */
  isSolo(): boolean {
    return ui.players.length > 0 && ui.players.filter((p) => !p.bot).length === 1 && !ui.spectator;
  }

  /** Vitesse de jeu suivante (+1) ou précédente (-1) parmi GAME_SPEEDS ; le serveur l'applique et l'annonce. */
  stepSpeed(delta: number): void {
    if (!this.isSolo()) {
      pushMessage("La vitesse ne se règle qu'en partie solo", "alert");
      return;
    }
    // part de la dernière vitesse demandée : plusieurs appuis rapides s'enchaînent avant la réponse du serveur
    const cur = performance.now() - this.speedAskedAt < 1000 ? this.speedAsked : ui.speed;
    const k = GAME_SPEEDS.indexOf(cur);
    const next = GAME_SPEEDS[Math.max(0, Math.min(GAME_SPEEDS.length - 1, (k < 0 ? GAME_SPEEDS.indexOf(1) : k) + delta))];
    if (next === cur) return;
    this.speedAsked = next;
    this.speedAskedAt = performance.now();
    this.send({ t: "speed", speed: next });
  }
  private speedAsked = 1;
  private speedAskedAt = -1e9;

  lobbyAction(action: string, extra: Record<string, unknown> = {}): void {
    this.send({ t: "lobby", action, ...extra });
  }

  chat(text: string): void {
    if (text.trim()) this.send({ t: "chat", text });
  }

  /** Démo à ordres locaux (?demo=formation) : les ordres vont directement au worker. */
  private demoOrders = false;

  cmd(c: Ord.Cmd): void {
    if (this.demoOrders) {
      this.worker?.postMessage({ type: "demoCmd", cmd: c });
      return;
    }
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
        ui.speed = 1;
        void this.begin(m.start, null);
        ui.stats = [];
        break;
      case "snapshot":
        // la vitesse en cours (si elle n'est pas ×1) suit dans un message « speed »
        ui.speed = 1;
        void this.begin(m.start, { tick: m.tick, data: Uint8Array.from(atob(m.data), (c) => c.charCodeAt(0)) });
        ui.stats = m.stats ?? [];
        break;
      case "stats":
        ui.stats = [...ui.stats, m.sample];
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
        ui.ended = true;
        if (m.stats) ui.stats = m.stats;
        break;
      }
      case "saved":
        pushMessage(m.auto ? `Sauvegarde automatique : ${m.name}` : `Partie sauvegardée par ${m.by} : ${m.name}`, "good");
        break;
      case "pong":
        ui.ping = Math.round(performance.now() - m.time);
        break;
      case "speed":
        ui.speed = m.speed;
        if (m.by) pushMessage(`Vitesse de jeu ×${String(m.speed).replace(".", ",")}`, "info");
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
    ui.fog = fogFromParams(start.params);
    ui.names = start.names;
    ui.gameOver = null;
    ui.ended = false;
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
    ui.fog = fogFromParams(rep.params ?? []);
    ui.stats = Array.isArray(rep.stats) ? rep.stats : [];
    ui.screen = "loading";
    this.start = { params: rep.params, names: rep.names, you: -1, startTick: 0 };
    this.worker?.terminate();
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e) => this.onWorker(e.data);
    this.worker.postMessage({ type: "loadReplay", wasmUrl: new URL("/sim.wasm", location.href).href, replay: rep });
  }

  startDemo(): void {
    ui.replay = true;
    ui.me = -1;
    ui.spectator = true;
    ui.names = Array.from({ length: 8 }, (_, i) => `Armée ${i + 1}`);
    ui.screen = "loading";
    this.worker?.terminate();
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e) => this.onWorker(e.data);
    // ?demo=eau : carte avec de l'eau, sans les armées (aperçu du terrain)
    // ?demo=logistique : trains, drones et entrepôt d'équipe (vu comme le joueur 1, brouillard coupé)
    // ?demo=armes : expérimentales, balles, traits d'énergie et rayons prolongés face à une armée
    // ?demo=projectiles : une rangée par arme qui tire au sol, pour juger chaque projectile
    // ?demo=vitrine : un exemplaire de chaque bâtiment et de chaque unité, pour juger les modèles en jeu
    // ?demo=formation : une armée mêlée du joueur 0, à qui l'on donne des ordres (déplacements en formation)
    const scene = new URLSearchParams(location.search).get("demo") ?? "";
    // état de la synthèse des sons, pour les vérifications automatiques
    (window as unknown as { __sfx?: unknown }).__sfx = sfx;
    const water = scene === "eau";
    if (scene === "logistique") ui.me = 0;
    this.demoOrders = scene === "formation";
    if (this.demoOrders) ui.me = 0;
    this.worker.postMessage({ type: "demo", wasmUrl: new URL("/sim.wasm", location.href).href, water, scene });
  }

  setReplaySpeed(s: number): void {
    ui.replaySpeed = s;
    this.worker?.postMessage({ type: "replay", speed: s });
  }

  private async onWorker(m: { type: string; [k: string]: unknown }): Promise<void> {
    switch (m.type) {
      case "ready": {
        this.data = JSON.parse(m.data as string) as GameData;
        // sons de combat : calculés en tâche de fond dès que les armes sont connues
        sfx.warm(this.data.weapons);
        ui.data = this.data;
        this.map = parseMapInfo(m.mapInfo as Int32Array, m.heights as Uint8Array);
        this.maxGround = -1;
        if (!this.scene) {
          this.scene = new GameScene(this.canvasEl!);
          await this.scene.init(new URLSearchParams(location.search).has("webgl"));
          ui.backend = this.scene.backend;
          this.scene.iconDistance = this.iconDistance();
          this.scene.applySettings(ui.gfx);
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
    const alpha = this.frame ? Math.min(1, ((performance.now() - this.frameTime) * ui.speed) / 50) : 0;
    const myTeam = this.frame?.players[ui.me]?.team ?? -1;
    if (!NORENDER) sc.render(this.frame, alpha, ui.me, myTeam, this.selected, dt, ui.spectator, ui.fog);
    // zone vue envoyée au Worker
    const r = sc.viewRect();
    this.worker?.postMessage({ type: "view", x0: Math.floor(r[0]), y0: Math.floor(r[1]), x1: Math.ceil(r[2]), y1: Math.ceil(r[3]), detail: sc.strategic ? 0 : sc.distance > 150 ? 1 : 2, player: ui.me });
    if (now - this.lastUiUpdate > 250) {
      ui.fps = Math.round((this.fpsCount * 1000) / (now - this.lastUiUpdate || 1));
      if (ui.showPerf) ui.perf = { ...sc.stats, frameMs: this.fpsCount ? (now - this.lastUiUpdate) / this.fpsCount : 0 };
      this.fpsCount = 0;
      this.lastUiUpdate = now;
      this.updateUi();
    }
    // zones électriques : vue électrique (touche maintenue) ou pose d'un bâtiment qui consomme ou alimente
    const pv = keymap.held("powerView", this.keys);
    if (pv !== ui.powerView) ui.powerView = pv;
    const placing = ui.mode === "build" && ui.buildKind >= 0 ? this.data?.buildings[ui.buildKind] : undefined;
    const placingPower = !!placing && (placing.supply > 0 || placing.powerUse > 0);
    const showZones = pv || placingPower;
    // les zones servent aussi à la mini-carte et aux jauges : requête toutes les 2 s, toutes les 0,4 s affichées
    if (this.frame && ui.me >= 0 && now - this.lastZonesQuery > (showZones ? 400 : 2000)) {
      this.lastZonesQuery = now;
      void this.query<PowerZones | null>("powerZones", [ui.me]).then((z) => {
        if (!z || !this.data) return;
        this.zones = z;
        const data = this.data;
        sc.power?.setZones(z, (kind) => data.buildings[kind]?.connect ?? 0, (x, zz) => (this.map ? groundHeight(this.map, x, zz) : 0));
        if (sc.power) ui.powerNets = sc.power.nets;
        if (sc.entities) {
          const g = new Map<number, { f: number; low: boolean }>();
          const autonomy = new Map<number, number>();
          for (const n of z.nets) autonomy.set(n[0], n[7]);
          for (const q of z.poles) if (q[6] === 1) g.set(q[9] >>> 0, { f: q[7] / 1000, low: q[7] <= 0 || (q[5] > 0 && (autonomy.get(q[5]) ?? -1) >= 0 && (autonomy.get(q[5]) ?? 0) < 60) });
          sc.entities.fuelGauges = g;
        }
      });
    }
    if (showZones && sc.power && this.frame) {
      const preview = placing && placing.supply > 0 ? this.ghostCells.map((c) => ({ x: c.x, y: c.y, w: c.dir & 1 ? placing.h : placing.w, h: c.dir & 1 ? placing.w : placing.h, s: placing.supply })) : [];
      sc.power.show(preview, pv);
      this.lastPowerShow = now;
    } else if (this.lastPowerShow) {
      this.lastPowerShow = 0;
      sc.power?.hide();
    }
    // vue logistique : tant que la touche est maintenue
    const logi = keymap.held("logisticsView", this.keys);
    if (logi !== ui.logisticsView) ui.logisticsView = logi;
    if (sc.entities) sc.entities.logistics = logi;
    // points de vie de l'unité sélectionnée seule
    if (ui.unitInfo && now - this.unitInfoAt > 400) this.refreshUnitInfo();
    // curseur : les unités bougent sous une souris immobile, la sélection change
    if (now - this.cursorAt > 150) this.updateCursor();
    // ordres affichés avec Maj (unités sélectionnées) ; constructions prévues de nos bâtisseurs
    const shift = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    // ordres des seules unités qui nous appartiennent (jamais ceux d'un ennemi sélectionné)
    sc.showOrders = shift && this.selOwn.size > 0;
    if (sc.showOrders && now - this.lastOrdersQuery > 250) {
      this.lastOrdersQuery = now;
      const ids = [...this.selOwn].slice(0, 400);
      void this.query<Int32Array | null>("orders", ids).then((r) => sc.overlay?.setOrders(r));
    }
    if (ui.me >= 0 && !ui.spectator && now - this.lastPlannedQuery > 500) {
      this.lastPlannedQuery = now;
      void this.query<number[] | null>("researchQueue", [ui.me]).then((r) => {
        const q = r ?? [];
        // juste après une modification locale, la simulation n'a pas encore exécuté les ordres
        if (performance.now() - this.researchEdit < 2000) return;
        if (q.length !== ui.researchQueue.length || q.some((x, i) => x !== ui.researchQueue[i])) ui.researchQueue = q;
      });
      void this.query<Int32Array | null>("planned", [ui.me]).then((r) => {
        this.planned = r ?? [];
        // fantôme sélectionné disparu (chantier posé, annulé…) : fiche refermée
        const p = ui.selPlan;
        if (p && !this.plannedAt(p.x, p.y, (k, x, y) => k === p.kind && x === p.x && y === p.y)) ui.selPlan = null;
        sc.overlay?.setPlanned(this.planned, ui.selPlan);
      });
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
    // pas de défilement pendant un raccourci avec Ctrl ou Alt (Ctrl+S…)
    const mod = this.keys.has("ControlLeft") || this.keys.has("ControlRight") || this.keys.has("AltLeft") || this.keys.has("AltRight");
    if (!mod && !kb.capturing) {
      if (keymap.held("panLeft", this.keys)) dx -= 1;
      if (keymap.held("panRight", this.keys)) dx += 1;
      if (keymap.held("panUp", this.keys)) dz -= 1;
      if (keymap.held("panDown", this.keys)) dz += 1;
    }
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
    // proximité d'un son (0 à 1) : distance au point regardé, et hauteur de la caméra (de haut, la
    // bataille s'entend comme de loin : assourdie, avec l'écho du terrain)
    const high = 1 - 0.5 * Math.min(1, Math.max(0, (sc.distance - 30) / 220));
    const near = (x: number, z: number) => {
      const d = Math.hypot(x - cam.x, z - cam.z);
      return Math.max(0, 1 - d / (sc.distance * 1.2 + 20)) * high;
    };
    // placement gauche-droite d'un son : position à l'écran (hors écran : au bord)
    const el = this.canvasEl;
    const pp = { x: 0, y: 0 };
    const pan = (x: number, z: number) => {
      if (!el || !this.map || !sc.project(x, groundHeight(this.map, x, z), z, pp)) return 0;
      return Math.max(-1, Math.min(1, (pp.x / Math.max(1, el.clientWidth)) * 2 - 1));
    };
    const myTeam = f.players[ui.me]?.team ?? -1;
    // les effets ne trahissent pas ce qui se passe sous le brouillard de guerre
    const vis = f.vis;
    const vw = f.visW;
    const seen = (x: number, z: number) => {
      if (ui.spectator || !ui.fog || !vis) return true;
      const cx = Math.min(vw - 1, Math.max(0, (x / 4) | 0));
      const cz = Math.min(vw - 1, Math.max(0, (z / 4) | 0));
      return (vis[cz * vw + cx] & 1) !== 0;
    };
    const fx = sc.entities?.effects; // absent en mode sans rendu
    for (let i = 0, o = f.eventOff; i < f.nEvents; i++, o += 5) {
      const [type, a, c, d, e] = [b[o], b[o + 1], b[o + 2], b[o + 3], b[o + 4]];
      switch (type) {
        case EV.EXPLOSION: {
          const x = a / TILE;
          const z = c / TILE;
          if (seen(x, z) || e === 3) {
            sc.entities?.addExplosion(x, z, d / TILE, e);
            sfx.explosion(d / TILE, e, near(x, z), pan(x, z));
          }
          break;
        }
        case EV.BEAM: {
          const x0 = a / TILE, z0 = c / TILE, x1 = d / TILE, z1 = e / TILE;
          const y0 = groundHeight(this.map!, x0, z0) + 1.2;
          const y1 = groundHeight(this.map!, x1, z1) + 0.5;
          if (!seen(x0, z0) && !seen(x1, z1)) break;
          sc.entities?.addBeam(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1), 0xff4040, 0.12);
          fx?.sparks(x1, y1, z1, [4, 0.8, 0.6], 4);
          sfx.strike(Math.max(near(x0, z0), near(x1, z1)), pan(x1, z1));
          break;
        }
        case EV.FIRE: {
          const w = this.data!.weapons[a];
          if (w) sfx.fire(w, near(c / TILE, d / TILE), pan(c / TILE, d / TILE));
          // morsure (proj 12) : pas de projectile, un éclat au point mordu
          if (w?.proj === 12 && seen(c / TILE, d / TILE)) {
            const x = c / TILE;
            const z = d / TILE;
            fx?.bite(x, groundHeight(this.map!, x, z) + 0.4, z, w.dmg > 60 ? 1.6 : w.dmg > 20 ? 1.2 : 0.8);
          }
          break;
        }
        case EV.BUILT:
          if (a === ui.me) sfx.built();
          break;
        case EV.ATTACKED:
          if (a === ui.me) this.onAttacked(c / TILE, d / TILE, e === 1);
          break;
        case EV.FUEL_LOW:
        case EV.FUEL_DRY:
          // générateur : moins d'une minute de combustible, puis à sec (au plus une annonce toutes les 15 s)
          if (a === ui.me && performance.now() - this.lastFuelAlert > 15000) {
            this.lastFuelAlert = performance.now();
            const name = this.data!.buildings[e]?.name ?? "Générateur";
            if (type === EV.FUEL_DRY) {
              say("energie");
              pushMessage(`${name} à sec : sa zone électrique est éteinte (collez-lui un extracteur d'hydrocarbure ou un dépôt, ou amenez du combustible)`, "alert");
            } else pushMessage(`${name} : moins d'une minute de combustible`, "alert");
            this.alertPos = { x: c / TILE, z: d / TILE };
          }
          break;
        case EV.SHARDS:
          // nid détruit : fragments d'énergie gagnés
          if (a === ui.me) {
            pushMessage(`Nid détruit : ${e} fragment${e > 1 ? "s" : ""} d'énergie récupéré${e > 1 ? "s" : ""} (surcadençage des machines, dans leur fiche)`, "info");
            sfx.confirm();
          }
          break;
        case EV.FACTORY_STARVED:
          // usine à l'arrêt faute de composants (au plus une annonce toutes les 30 s)
          if (a === ui.me && performance.now() - this.lastStarveAlert > 30000) {
            this.lastStarveAlert = performance.now();
            pushMessage(`Usine à l'arrêt, composant manquant : ${this.data!.items[e]?.name ?? "?"} (collez un dépôt à l'usine ou amenez un tapis)`, "alert");
            this.alertPos = { x: c / TILE, z: d / TILE };
          }
          break;
        case EV.RESEARCH:
          if (a === ui.me) {
            sfx.research();
            say("recherche");
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
          if (seen(a / TILE, c / TILE)) {
            const def = this.data!.units[d];
            if (def && def.layer !== Layer.Sub) fx?.wreckage(a / TILE, c / TILE, Math.max(0.5, (def.radius * 2) / TILE), new THREE.Color(ownerColor(owner, this.frame?.players)), false);
          }
          void owner;
          break;
        }
        case EV.BUILDING_DIED:
          if (seen(a / TILE, c / TILE)) {
            const def = this.data!.buildings[d];
            if (def && def.cls !== BClass.Belt && def.cls !== BClass.Inserter) fx?.wreckage(a / TILE, c / TILE, Math.max(def.w, def.h), new THREE.Color(ownerColor(e, this.frame?.players)), true);
          }
          break;
        case EV.PROMOTED: {
          // montée en grade : éclat doré ; message pour nos unités (au plus un toutes les 5 s)
          const x = a / TILE, z = c / TILE;
          if (seen(x, z)) fx?.sparks(x, groundHeight(this.map!, x, z) + 1.5, z, [3, 2.4, 0.6], 8);
          if (e === ui.me && performance.now() - this.lastPromo > 5000) {
            this.lastPromo = performance.now();
            pushMessage(`Unité promue : vétérance ${"★".repeat(d)}`, "good");
          }
          break;
        }
        case EV.GIFT: {
          // dons par portail : regroupés en un message par seconde
          if (d === ui.me || e === ui.me) {
            const k = `${d}:${e}`;
            this.gifts.set(k, (this.gifts.get(k) ?? 0) + 1);
            if (!this.giftTimer) {
              this.giftTimer = window.setTimeout(() => {
                for (const [key, n] of this.gifts) {
                  const [from, to] = key.split(":").map(Number);
                  if (to === ui.me) pushMessage(`Renforts : ${n} unité${n > 1 ? "s" : ""} reçue${n > 1 ? "s" : ""} de ${ui.names[from] ?? "un allié"}`, "good");
                  else pushMessage(`${n} unité${n > 1 ? "s" : ""} donnée${n > 1 ? "s" : ""} à ${ui.names[to] ?? "un allié"}`, "info");
                }
                this.gifts.clear();
                this.giftTimer = 0;
              }, 1000);
            }
          }
          break;
        }
        case EV.TELEPORT:
          sfx.teleport(Math.max(near(a / TILE, c / TILE), near(d / TILE, e / TILE)));
          if (seen(a / TILE, c / TILE)) fx?.warp(a / TILE, c / TILE);
          if (seen(d / TILE, e / TILE)) fx?.warp(d / TILE, e / TILE);
          break;
        case EV.INTERCEPT:
          sc.entities?.addBeam(new THREE.Vector3(a / TILE, groundHeight(this.map!, a / TILE, c / TILE) + 2, c / TILE), new THREE.Vector3(d / TILE, 40, e / TILE), 0x80ffff, 0.6);
          pushMessage("Missile intercepté", "good");
          break;
        case EV.SHIELD_HIT:
          if (Math.random() < 0.4 && seen(a / TILE, c / TILE)) fx?.sparks(a / TILE, groundHeight(this.map!, a / TILE, c / TILE) + 1, c / TILE, [1.2, 2.6, 4], 3);
          break;
      }
    }
    void myTeam;
    // énergie insuffisante : annonce au passage sous la demande (au plus une fois par minute)
    const me = f.players[ui.me];
    if (me) {
      const low = me.powerUse > me.powerProd && me.powerUse > 0;
      if (low && !this.powerWasLow && performance.now() - this.lastPowerAlert > 60000) {
        this.lastPowerAlert = performance.now();
        say("energie");
        pushMessage("Énergie insuffisante : construisez des générateurs", "alert");
      }
      this.powerWasLow = low;
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
      ui.teamStock = Array.from(me.teamStock);
      ui.stockCap = me.stockCap;
      ui.shards = me.shards ?? 0;
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
    // la faune (joueur caché, le dernier) n'apparaît pas parmi les joueurs
    ui.players = realPlayers(f.players).map((p, i) => ({ name: ui.names[i] ?? `Joueur ${i + 1}`, alive: p.alive, team: p.team, units: p.unitCount, kills: p.kills, losses: p.losses, bot: p.bot, power: p.powerProd }));
    // sélection : retirer les morts, regrouper par type
    const groups = new Map<number, number[]>();
    const lvls = new Map<number, number>();
    const alive = new Set<number>();
    let foreign = -1;
    this.selOwn.clear();
    for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += UNIT_WORDS) {
      const id = f.buf[o] >>> 0;
      if (!this.selected.has(id)) continue;
      alive.add(id);
      const own = (f.buf[o + 1] >> 8) & 0xff;
      if (own === ui.me) this.selOwn.add(id);
      else foreign = own;
      const k = f.buf[o + 1] & 0xff;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(id);
      lvls.set(k, Math.max(lvls.get(k) ?? 0, (f.buf[o + 1] >>> 24) & 7));
    }
    // bâtiments sélectionnés : un seul passage sur l'image quand il y en a beaucoup
    const selBs: { ref: number; kind: number; owner: number }[] = [];
    let nb = 0;
    for (const id of this.selected) if (Ord.isBuildingRef(id)) nb++;
    const byRef = nb > 4 ? new Map<number, { ref: number; kind: number; owner: number }>() : null;
    if (byRef) {
      for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
        const ref = f.buf[o] >>> 0;
        if (this.selected.has(ref)) byRef.set(ref, { ref, kind: f.buf[o + 1] & 0xff, owner: (f.buf[o + 1] >> 8) & 0xff });
      }
    }
    for (const id of this.selected) {
      if (Ord.isBuildingRef(id)) {
        const bw = byRef ? byRef.get(id) : this.findBuilding(id);
        if (bw) {
          alive.add(id);
          selBs.push({ ref: bw.ref, kind: bw.kind, owner: bw.owner });
        } else if (!this.frame || this.scene?.strategic) alive.add(id);
      }
    }
    const selB: typeof ui.selBuilding = selBs.length === 1 ? selBs[0] : null;
    for (const id of [...this.selected]) if (!alive.has(id)) this.selected.delete(id);
    ui.selUnits = [...groups.entries()].map(([kind, ids]) => ({ kind, count: ids.length, ids, lvl: lvls.get(kind) ?? 0 })).sort((a, b) => a.kind - b.kind);
    ui.selBuilding = selB;
    ui.selBuildings = selBs;
    // unités d'un autre joueur (sans aucune des nôtres) : fiche de statistiques seulement
    ui.selForeign = this.selOwn.size === 0 && ui.selUnits.length ? foreign : -1;
    if (this.selected.size) {
      ui.selDeposit = null;
      ui.selPlan = null;
    }
    // une seule unité (la nôtre ou une autre) : ses points de vie (rafraîchis dans la boucle d'affichage)
    if (ui.selUnits.length === 1 && ui.selUnits[0].count === 1) this.refreshUnitInfo();
    else ui.unitInfo = null;
    ui.canBuild = ui.selUnits.some((g) => this.data!.units[g.kind].buildPower > 0) && ui.me >= 0 && ui.selForeign < 0;
    if (!ui.canBuild && kb.buildStep) kb.buildStep = "";
    if (selB) {
      void this.query<Record<string, unknown> | null>("building", [selB.ref]).then((r) => (ui.buildingInfo = r));
    } else ui.buildingInfo = null;
    this.plans.tick();
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
    // plusieurs niveaux sur une case (tapis surélevé au-dessus) : le plus haut d'abord
    let best: { ref: number; kind: number; owner: number; x: number; y: number; build: number; hp: number } | null = null;
    let bestFloor = -1;
    for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      const kind = f.buf[o + 1] & 0xff;
      const def = this.data.buildings[kind];
      const x = f.buf[o + 2] & 0xffff;
      const y = (f.buf[o + 2] >>> 16) & 0xffff;
      const floor = (f.buf[o + 1] >>> 28) & 3;
      if (tx >= x && tx < x + def.w && tz >= y && tz < y + def.h && floor > bestFloor) {
        best = { ref: f.buf[o] >>> 0, kind, owner: (f.buf[o + 1] >> 8) & 0xff, x, y, build: f.buf[o + 4], hp: f.buf[o + 3] };
        bestFloor = floor;
      }
    }
    return best;
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
    void initLayout();
    const v = Number(localStorage.getItem("supreme.volume") ?? "0.5");
    ui.volume = v;
    setVolume(v);
    const mv = Number(localStorage.getItem("supreme.music") ?? "0.35");
    ui.music = mv;
    initMusic(mv);
    ui.voice = localStorage.getItem("supreme.voice") !== "0";
    setVoiceEnabled(ui.voice);
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
      this.lineEndDir = null;
      this.lineFrozen = [];
      this.lineAxis = null;
    }
    if (e.button === 0) this.plans.down();
    // clic droit sur le terrain avec des unités : le glisser oriente la formation (sinon : caméra)
    this.formStart = null;
    this.formAngle = null;
    if (e.button === 2 && !ui.mode && ui.me >= 0 && this.selectedUnits().length > 0) {
      const g = this.groundAt(x, y);
      if (g) this.formStart = { x: g.x, z: g.z };
    }
  }

  /** Clic droit glissé : point visé et angle choisi (radians, atan2(dz, dx)), null tant que le geste est trop court. */
  private formStart: { x: number; z: number } | null = null;
  private formAngle: number | null = null;

  /** Unités sélectionnées prêtes pour une formation : position, orientation et taille. */
  private formationUnits(): (Ord.FormationUnit & { radius: number })[] {
    const data = this.data!;
    const f = this.frame;
    if (!f) return [];
    const out: (Ord.FormationUnit & { radius: number })[] = [];
    for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += UNIT_WORDS) {
      const id = f.buf[o] >>> 0;
      if (!this.selected.has(id) || ((f.buf[o + 1] >> 8) & 0xff) !== ui.me) continue;
      const d = data.units[f.buf[o + 1] & 0xff];
      out.push({ id, x: f.buf[o + 2], y: f.buf[o + 3], facing: f.buf[o + 6] & 0xffff, radius: d.radius });
    }
    return out;
  }

  /** Aperçu de la formation pendant le glisser. */
  private updateFormationPreview(x: number, y: number): void {
    const sc = this.scene;
    const start = this.formStart;
    if (!sc || !start) return;
    const g = this.groundAt(x, y);
    if (!g) return;
    const len = Math.hypot(g.x - start.x, g.z - start.z);
    if (len < 0.6) {
      this.formAngle = null;
      sc.setFormation(null);
      return;
    }
    const angle = Math.atan2(g.z - start.z, g.x - start.x);
    this.formAngle = angle;
    const units = this.formationUnits();
    const slots = Ord.formationSlots(units, start.x * TILE, start.z * TILE, angle);
    const size = new Map(units.map((u) => [u.id, u.radius / TILE]));
    sc.setFormation(
      slots.map((p) => ({ x: p.x / TILE, z: p.y / TILE, size: (size.get(p.id) ?? 0.5) * 0.8 })),
      angle,
      start,
      Math.min(len, 12),
    );
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
    this.updateCursor();
    if (ui.mode === "build") this.updateGhost();
    else this.plans.move();
    if (this.mouse.down && this.mouse.button === 0 && this.mouse.dragging && ui.mode !== "build" && ui.mode !== "copy" && ui.mode !== "paste" && this.selBox) {
      const b = this.selBox;
      b.style.display = "block";
      b.style.left = Math.min(x, this.mouse.startX) + "px";
      b.style.top = Math.min(y, this.mouse.startY) + "px";
      b.style.width = Math.abs(x - this.mouse.startX) + "px";
      b.style.height = Math.abs(y - this.mouse.startY) + "px";
    }
    // clic droit glissé : orientation de la formation (unités sélectionnées) ou déplacement de la caméra
    if (this.mouse.down && this.mouse.button === 2 && this.mouse.dragging && this.formStart) {
      this.updateFormationPreview(x, y);
    } else if (this.mouse.down && this.mouse.button === 2 && this.mouse.dragging) {
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
      if (ui.mode === "copy" || ui.mode === "paste") {
        this.plans.up(e.shiftKey);
        return;
      }
      if (ui.mode === "reclaim" && this.mouse.dragging) {
        // cadre de recyclage : tous nos bâtiments et les épaves du cadre
        void this.reclaimArea(this.mouse.startX, this.mouse.startY, x, y, e.shiftKey);
        if (this.selBox) this.selBox.style.display = "none";
        return;
      }
      if (ui.mode) {
        this.modeClick(x, y, e.shiftKey);
        return;
      }
      if (this.mouse.dragging) this.boxSelect(this.mouse.startX, this.mouse.startY, x, y, e.shiftKey);
      else this.clickSelect(x, y, e.shiftKey, e.ctrlKey);
    } else if (e.button === 2) {
      const start = this.formStart;
      const angle = this.formAngle;
      this.formStart = null;
      this.formAngle = null;
      this.scene?.setFormation(null);
      if (this.mouse.dragging && start && angle !== null && this.data && ui.me >= 0) {
        // formation orientée : le groupe garde sa disposition, tournée vers la direction du glisser,
        // avance à la vitesse du plus lent et chacun se tourne vers cette direction à l'arrivée
        const units = this.formationUnits();
        if (units.length) {
          this.cmd(Ord.moveFormation(units, Math.round(start.x * TILE), Math.round(start.z * TILE), angle, e.shiftKey));
          this.scene?.addMarker(start.x, start.z, 0x7dff9a);
          sfx.confirm();
        }
        return;
      }
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
    // pose d'un répartiteur : la molette choisit ses sorties (les trois, gauche et avant, droite et avant)
    if (ui.mode === "build" && this.data?.buildings[ui.buildKind]?.key === "splitter" && !e.ctrlKey) {
      ui.buildSplit = (ui.buildSplit + (e.deltaY < 0 ? 1 : 2)) % 3;
      sfx.click();
      this.updateGhost();
      return;
    }
    // pose de tapis : la molette choisit le niveau (sol, étage 1, étage 2) au lieu du zoom. Pendant le
    // tracé, la partie déjà tracée garde son niveau : seule la suite de la file monte ou descend
    if (ui.mode === "build" && this.isBeltKind() && !e.ctrlKey) {
      const f = Math.max(0, Math.min(2, ui.buildFloor + (e.deltaY < 0 ? 1 : -1)));
      if (f !== ui.buildFloor) {
        const cells = this.ghostCells;
        if (this.mouse.down && this.ghostStart && cells.length > 1 && cells.length > this.lineFrozen.length) {
          this.lineFrozen = cells.map((c) => ({ x: c.x, y: c.y, dir: c.dir, floor: c.floor ?? 0 }));
          this.lineAxis = null;
          this.lineEndDir = null;
        }
        ui.buildFloor = f;
        sfx.click();
        this.updateGhost();
      }
      return;
    }
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

  /** Champ de saisie de texte : le clavier lui appartient (discussion, pseudo…). */
  private static typing(t: EventTarget | null): boolean {
    const el = t as HTMLElement | null;
    if (!el || !el.tagName) return false;
    if (el.isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
    if (el.tagName !== "INPUT") return false;
    const type = (el as HTMLInputElement).type;
    return !["checkbox", "radio", "range", "button", "submit", "color"].includes(type);
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (!down) {
      // relâchement toujours pris en compte (même si un champ a pris le focus entre-temps)
      this.keys.delete(e.code);
      return;
    }
    if (kb.capturing || GameClient.typing(e.target)) return;
    if (keymap.observe(e)) keysChanged();
    if (ui.screen !== "game" || e.metaKey) return;
    this.keys.add(e.code);
    if (isModifierCode(e.code)) return;
    // menu de construction au clavier : B, puis la catégorie, puis le bâtiment
    if (kb.buildStep) {
      if (this.buildMenuKey(e)) {
        e.preventDefault();
        return;
      }
    }
    // groupes de contrôle (touche physique : « 1 » même si elle donne « & »)
    const grp = groupKey(e);
    if (grp) {
      e.preventDefault();
      if (e.repeat) return;
      const n = grp.n;
      if (grp.create) {
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
      return;
    }
    if (e.code === "Escape" && !e.ctrlKey && !e.altKey) {
      if (kb.buildStep) kb.buildStep = "";
      else if (ui.mode) this.cancelMode();
      else if (kb.showKeys || ui.showResearch || ui.showStats || ui.showHelp || ui.showRecipes || plans.show) kb.showKeys = ui.showResearch = ui.showStats = ui.showHelp = ui.showRecipes = plans.show = false;
      else {
        this.selected.clear();
        ui.selDeposit = null;
        if (ui.selPlan) {
          ui.selPlan = null;
          this.scene?.overlay?.setPlanned(this.planned, null);
        }
        this.updateUi();
      }
      return;
    }
    const units = ui.me >= 0 && this.selectedUnits().length > 0;
    const m = keymap.match(e, { units, build: ui.mode === "build" || ui.mode === "paste" || (!units && this.rotatableSelection().length > 0), factory: !units && this.myFactory() !== null });
    if (!m) return;
    e.preventDefault();
    if (e.repeat && !actionDef(m.id)?.repeat) return;
    this.runAction(m.id, m.shift);
  }

  /** Exécute une action nommée du module de raccourcis. */
  runAction(id: string, shift = false): void {
    if (id.startsWith("factory")) {
      this.queueSlot(Number(id.slice(7)) - 1, shift ? 5 : 1);
      return;
    }
    if (id.startsWith("camGo")) return this.recallBookmark(Number(id.slice(5)) - 1);
    if (id.startsWith("camSave")) return this.saveBookmark(Number(id.slice(7)) - 1);
    switch (id) {
      case "attackMove":
        if (this.selected.size) this.setMode("attackMove");
        break;
      case "patrol":
        if (this.selected.size) this.setMode("patrol");
        break;
      case "stop":
        this.stopSelected();
        break;
      case "reclaim":
        if (ui.canBuild) this.setMode("reclaim");
        break;
      case "assist":
        if (this.selected.size) this.setMode("assist");
        break;
      case "harvest":
        if (this.commandersOf(this.selectedUnits()).length) this.setMode("harvest");
        break;
      case "deploy":
        this.deploySelected();
        break;
      case "unload":
        this.setMode("unload");
        break;
      case "buildMenu":
        if (ui.canBuild) {
          kb.buildStep = "cat";
          sfx.click();
        }
        break;
      case "rotate":
        if (ui.mode === "build") {
          // file de tapis en cours de tracé : R tourne la fin de la file (d'un quart de tour à chaque appui)
          if (this.isBeltKind() && this.mouse.down && this.ghostStart && this.ghostCells.length > 1) {
            const end = this.ghostCells[this.ghostCells.length - 1].dir;
            this.lineEndDir = (end + 1) % 4;
            this.updateGhost();
            break;
          }
          // tapis : la direction (donc la forme) est automatique jusqu'au premier R, qui la force
          const cur = this.ghostCells.length === 1 ? this.ghostCells[0].dir : ui.buildDir;
          ui.buildDir = ((this.isBeltKind() && !this.beltForced ? cur : ui.buildDir) + 1) % 4;
          this.beltForced = true;
          this.updateGhost();
        } else if (ui.mode === "paste") this.plans.rotate();
        else {
          // tapis, bras ou tapis de contrôle sélectionnés : un quart de tour sur place
          const refs = this.rotatableSelection();
          if (refs.length) {
            this.cmd(Ord.rotate(refs));
            sfx.click();
          }
        }
        break;
      case "copyPlan":
        this.plans.startCopy();
        break;
      case "pastePlan":
        this.plans.startPaste();
        break;
      case "planLibrary":
        plans.show = !plans.show;
        break;
      case "selectArmy":
        this.selectAllArmy();
        break;
      case "idleEngineer":
        this.selectIdleEngineer(shift);
        break;
      case "cancelBuilding":
        this.demolishSelected();
        break;
      case "zoomIn":
        if (this.scene) {
          this.scene.distance /= 1.3;
          this.scene.clampCamera();
        }
        break;
      case "zoomOut":
        if (this.scene) {
          this.scene.distance *= 1.3;
          this.scene.clampCamera();
        }
        break;
      case "commander":
        this.centerOnCommander();
        break;
      case "alert":
        if (this.alertPos && this.scene) {
          this.scene.target.x = this.alertPos.x;
          this.scene.target.z = this.alertPos.z;
        }
        break;
      case "research":
        ui.showResearch = !ui.showResearch;
        break;
      case "stats":
        ui.showStats = !ui.showStats;
        break;
      case "recipes":
        ui.showRecipes = !ui.showRecipes;
        break;
      case "help":
        ui.showHelp = !ui.showHelp;
        break;
      case "chat":
        ui.chatOpen = true;
        break;
      case "perf":
        ui.showPerf = !ui.showPerf;
        break;
      case "speedUp":
        this.stepSpeed(1);
        break;
      case "speedDown":
        this.stepSpeed(-1);
        break;
    }
  }

  /** Appui pendant le menu de construction ; vrai si l'appui est consommé. */
  private buildMenuKey(e: KeyboardEvent): boolean {
    if (!ui.canBuild) {
      kb.buildStep = "";
      return false;
    }
    const n = e.ctrlKey || e.altKey ? null : digitOf(e.code);
    if (n === null) {
      // Échap ou la touche du menu referment le menu ; toute autre touche le referme et agit
      const again = keymap.match(e, { units: true })?.id === "buildMenu";
      kb.buildStep = "";
      return e.code === "Escape" || again;
    }
    if (e.repeat) return true;
    if (kb.buildStep === "cat") {
      if (n <= BUILD_CATS.length) {
        kb.buildCat = n - 1;
        kb.buildStep = "item";
        sfx.click();
      } else sfx.error();
      return true;
    }
    const key = BUILD_CATS[kb.buildCat]?.[2][n - 1];
    const idx = key && this.data ? this.data.buildings.findIndex((b) => b.key === key) : -1;
    if (idx < 0) {
      sfx.error();
      return true;
    }
    const me = this.frame?.players[ui.me];
    if (me && !hasTech(me, this.data!.buildings[idx].tech)) {
      pushMessage(`${this.data!.buildings[idx].name} : recherche requise (${this.data!.techs[this.data!.buildings[idx].tech].name})`, "alert");
      sfx.error();
      return true;
    }
    kb.buildStep = "";
    this.startBuild(idx);
    return true;
  }

  /** Mon usine sélectionnée (seule, sans unités), ou null. */
  myFactory(): { ref: number; factory: number } | null {
    const b = ui.selBuilding;
    if (!b || b.owner !== ui.me || !this.data) return null;
    const def = this.data.buildings[b.kind];
    return def.cls === BClass.Factory ? { ref: b.ref, factory: def.factory } : null;
  }

  /** Touche n de la rangée de l'usine : met en file la n-ième unité du panneau. */
  private queueSlot(slot: number, delta: number): void {
    const fac = this.myFactory();
    if (!fac || !this.data) return;
    const kind = factoryUnitKinds(this.data, fac.factory)[slot];
    if (kind === undefined) return;
    const me = this.frame?.players[ui.me];
    const u = this.data.units[kind];
    if (me && !hasTech(me, u.tech)) {
      pushMessage(`${u.name} : recherche requise (${this.data.techs[u.tech].name})`, "alert");
      sfx.error();
      return;
    }
    this.queueUnit(kind, delta);
    sfx.click();
  }

  /**
   * Constructeur inactif suivant (ingénieurs et commandant sans ordre : ni déplacement, construction,
   * réparation ni récolte), par identifiant croissant et en boucle ; Maj : le précédent. Centre la caméra.
   */
  selectIdleEngineer(back = false): void {
    if (ui.me < 0) return;
    const idle = this.ownBuilders().filter((b) => b.idle);
    if (!idle.length) {
      pushMessage("Aucun constructeur inactif");
      sfx.error();
      return;
    }
    idle.sort((a, b) => a.id - b.id);
    const last = this.lastIdleEngineer;
    if (back) idle.reverse();
    const next = idle.find((u) => (back ? u.id < last : u.id > last)) ?? idle[0];
    this.lastIdleEngineer = next.id;
    this.selected = new Set([next.id]);
    if (this.scene) {
      this.scene.target.x = next.x;
      this.scene.target.z = next.y;
    }
    sfx.click();
    this.updateUi();
  }

  saveBookmark(i: number): void {
    const sc = this.scene;
    if (!sc) return;
    this.bookmarks[i] = { x: sc.target.x, z: sc.target.z, distance: sc.distance };
    pushMessage(`Marque-page ${i + 1} enregistré (${keyOf(`camGo${i + 1}`) || "touche libre"} pour y revenir)`, "good");
  }
  recallBookmark(i: number): void {
    const b = this.bookmarks[i];
    const sc = this.scene;
    if (!sc) return;
    if (!b) {
      const k = keyOf(`camSave${i + 1}`);
      pushMessage(`Marque-page ${i + 1} vide${k ? ` (${k} pour l'enregistrer)` : ""}`);
      return;
    }
    sc.target.x = b.x;
    sc.target.z = b.z;
    sc.distance = b.distance;
    sc.clampCamera();
  }

  setMode(mode: string): void {
    if (ui.mode === "copy" || ui.mode === "paste") this.plans.clear();
    ui.mode = mode;
    if (mode !== "build") this.scene?.hideGhost();
    sfx.click();
    this.updateCursor(true);
  }
  cancelMode(): void {
    ui.mode = "";
    ui.buildKind = -1;
    this.resetLine();
    this.scene?.hideGhost();
    this.plans.clear();
    this.updateCursor(true);
  }

  // ---------- sélection ----------
  private ownedUnitAt(x: number, y: number, anyOwner = false): { id: number; kind: number; owner: number } | null {
    const sc = this.scene;
    if (!sc) return null;
    // le clic touche l'unité n'importe où sur sa silhouette : segment écran du pied au sommet du
    // modèle, épaissi de sa demi-largeur (et de quelques pixels de tolérance) ; la plus proche gagne
    let best = null;
    let bd = Infinity;
    const foot = { x: 0, y: 0 };
    const top = { x: 0, y: 0 };
    const side = { x: 0, y: 0 };
    const right = new THREE.Vector3().setFromMatrixColumn(sc.camera.matrixWorld, 0);
    for (const u of sc.entities.screen) {
      // une unité qu'on ne voit pas ne se clique pas : hors du dessin de cette image, ou cachée par le relief
      if (!u.visible || !u.drawn) continue;
      if (!anyOwner && u.owner !== ui.me) continue;
      const km = sc.entities.unitMeshes[u.kind];
      const h = Math.max(0.4, km?.height ?? 0.8);
      const half = Math.max(0.35, (this.data!.units[u.kind].radius * 2.3) / TILE / 2);
      if (!sc.project(u.x, u.y, u.z, foot) || !sc.project(u.x, u.y + h, u.z, top)) continue;
      sc.project(u.x + right.x * half, u.y + h / 2, u.z + right.z * half, side);
      const mid = { x: (foot.x + top.x) / 2, y: (foot.y + top.y) / 2 };
      const w = Math.max(6, Math.hypot(side.x - mid.x, side.y - mid.y));
      // distance du clic au segment pied-sommet
      const vx = top.x - foot.x;
      const vy = top.y - foot.y;
      const t = Math.max(0, Math.min(1, ((x - foot.x) * vx + (y - foot.y) * vy) / (vx * vx + vy * vy || 1)));
      const d = Math.hypot(x - (foot.x + vx * t), y - (foot.y + vy * t));
      if (d <= w + 5 && d < bd && !this.hiddenByTerrain(u.x, u.y + h / 2, u.z)) {
        bd = d;
        best = u;
      }
    }
    return best;
  }

  /** Le relief s'interpose-t-il entre la caméra et ce point ? (échantillons le long du segment, jusqu'au plus haut sommet) */
  private hiddenByTerrain(x: number, y: number, z: number): boolean {
    const sc = this.scene;
    const m = this.map;
    if (!sc || !m) return false;
    if (this.maxGround < 0) {
      let top = 0;
      for (let i = 0; i < m.heights.length; i++) if (m.heights[i] > top) top = m.heights[i];
      this.maxGround = top * HSCALE;
    }
    const c = sc.camera.position;
    const len = Math.hypot(c.x - x, c.y - y, c.z - z);
    if (len < 1) return false;
    // la première case autour de l'unité ne compte pas (pente sous ses pieds)
    for (let s = 1; s < len; s += 0.5) {
      const t = s / len;
      const py = y + (c.y - y) * t;
      if (py > this.maxGround) break;
      if (groundHeight(m, x + (c.x - x) * t, z + (c.z - z) * t) > py + 0.2) return true;
    }
    return false;
  }
  /** plus haut point du relief (monde), calculé au premier besoin */
  private maxGround = -1;

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
      else {
        // sélection homogène : des unités ou des bâtiments, pas les deux
        for (const id of [...this.selected]) if (Ord.isBuildingRef(id)) this.selected.delete(id);
        this.selected.add(u.id);
      }
      this.lastClick = { time: now, id: u.id };
      sfx.click();
    } else {
      const g = this.groundAt(x, y);
      if (g) {
        const b = this.buildingAtTile(Math.floor(g.x), Math.floor(g.z));
        if (b) {
          const now = performance.now();
          if (!add) this.selected.clear();
          // plusieurs bâtiments (Maj+clic, double-clic, cadre) : la sélection n'a plus d'unités
          for (const id of [...this.selected]) if (!Ord.isBuildingRef(id)) this.selected.delete(id);
          if (!add && b.owner === ui.me && this.lastClick.id === b.ref && now - this.lastClick.time < 350) {
            // double-clic : tous nos bâtiments de ce type à l'écran
            const el = this.canvasEl!;
            for (const ref of this.ownBuildingsInRect(0, 0, el.clientWidth, el.clientHeight, b.kind)) this.selected.add(ref);
          } else if (add && this.selected.has(b.ref)) this.selected.delete(b.ref);
          else this.selected.add(b.ref);
          this.lastClick = { time: now, id: b.ref };
          sfx.click();
        } else if (!add) {
          const tx = Math.floor(g.x);
          const tz = Math.floor(g.z);
          // construction prévue (fantôme) sous le curseur : sa fiche, d'où on peut l'annuler
          const pl = this.plannedAt(tx, tz);
          ui.selPlan = pl;
          this.scene?.overlay?.setPlanned(this.planned, pl);
          if (pl) {
            ui.selDeposit = null;
            sfx.click();
            this.updateUi();
            return;
          }
          // gisement (2 x 2 cases) sous le curseur : fiche du gisement
          const s = this.spotAt(tx, tz);
          ui.selDeposit = s ? { kind: s.kind, x: s.x, y: s.y, purity: s.purity } : null;
          if (s) sfx.click();
        }
      }
    }
    this.updateUi();
  }

  /** constructions prévues de notre camp (liste plate : type, x, y, direction), rafraîchie avec l'affichage */
  private planned: Int32Array | number[] = [];
  /** Construction prévue qui couvre la case (tx, tz) (et vérifie `ok`, si donné). */
  private plannedAt(tx: number, tz: number, ok?: (kind: number, x: number, y: number) => boolean): { kind: number; x: number; y: number; dir: number } | null {
    const l = this.planned;
    for (let i = 0; i + 3 < l.length; i += 4) {
      const [kind, x, y, dir] = [l[i], l[i + 1], l[i + 2], l[i + 3]];
      const d = this.data?.buildings[kind];
      if (!d) continue;
      if (ok) {
        if (ok(kind, x, y)) return { kind, x, y, dir };
        continue;
      }
      const w = dir & 1 ? d.h : d.w;
      const h = dir & 1 ? d.w : d.h;
      if (tx >= x && tx < x + w && tz >= y && tz < y + h) return { kind, x, y, dir };
    }
    return null;
  }
  /** Annule la construction prévue sélectionnée (touche Suppr ou bouton de sa fiche). */
  cancelPlan(): void {
    const p = ui.selPlan;
    if (!p) return;
    this.cmd(Ord.cancelPlan(p.x, p.y));
    ui.selPlan = null;
    this.scene?.overlay?.setPlanned(this.planned, null);
    sfx.confirm();
  }

  /** Bâtiment posé sur le gisement sélectionné (un extracteur), s'il y en a un. */
  depositUser(): { kind: number; owner: number } | null {
    const d = ui.selDeposit;
    if (!d) return null;
    const b = this.buildingAtTile(d.x, d.y) ?? this.buildingAtTile(d.x + 1, d.y + 1);
    return b ? { kind: b.kind, owner: b.owner } : null;
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
    if (n) {
      for (const id of [...this.selected]) if (Ord.isBuildingRef(id)) this.selected.delete(id);
    } else if (![...this.selected].some((id) => !Ord.isBuildingRef(id))) {
      // aucune unité dans le cadre : nos bâtiments (seule la démolition sera possible s'il y en a plusieurs)
      for (const ref of this.ownBuildingsInRect(ax, ay, bx, by)) {
        this.selected.add(ref);
        n++;
      }
    }
    if (n) sfx.click();
    this.updateUi();
  }

  /** Nos bâtiments dont le centre est dans le rectangle d'écran (pixels), d'un type donné si `kind` est fourni. */
  private ownBuildingsInRect(ax: number, ay: number, bx: number, by: number, kind?: number): number[] {
    const sc = this.scene;
    const f = this.frame;
    const out: number[] = [];
    if (!sc || !f || !this.data || !this.map) return out;
    const p = { x: 0, y: 0 };
    for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      const w1 = f.buf[o + 1];
      if (((w1 >> 8) & 0xff) !== ui.me || (kind !== undefined && (w1 & 0xff) !== kind)) continue;
      const d = this.data.buildings[w1 & 0xff];
      const dir = (w1 >> 16) & 3;
      const x = (f.buf[o + 2] & 0xffff) + (dir & 1 ? d.h : d.w) / 2;
      const z = ((f.buf[o + 2] >>> 16) & 0xffff) + (dir & 1 ? d.w : d.h) / 2;
      if (sc.project(x, groundHeight(this.map, x, z) + 0.3, z, p) && p.x >= ax && p.x <= bx && p.y >= ay && p.y <= by) out.push(f.buf[o] >>> 0);
    }
    return out;
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

  private unitInfoAt = 0;
  /** Points de vie et vétérance de l'unité sélectionnée seule (fiche de sélection). */
  private refreshUnitInfo(): void {
    this.unitInfoAt = performance.now();
    const g = ui.selUnits.length === 1 && ui.selUnits[0].count === 1 ? ui.selUnits[0] : null;
    if (!g) {
      ui.unitInfo = null;
      return;
    }
    const id = g.ids[0];
    void this.query<{ hp: number; maxHp: number; lvl: number; cloaked?: boolean; radarStealth?: boolean; harvest?: HarvestInfo | null } | null>("unit", [id]).then((r) => {
      // la sélection a pu changer pendant la requête
      if (ui.selUnits.length === 1 && ui.selUnits[0].count === 1 && ui.selUnits[0].ids[0] === id) ui.unitInfo = r;
    });
  }

  // ---------- curseur contextuel ----------
  private cursorKind: CursorKind | "" = "";
  private cursorAt = 0;

  /** Met à jour la forme du curseur selon ce qu'un clic ferait sous la souris (au plus 20 fois par seconde). */
  updateCursor(force = false): void {
    const el = this.canvasEl;
    if (!el) return;
    const now = performance.now();
    if (!force && now - this.cursorAt < 50) return;
    this.cursorAt = now;
    const kind = this.cursorIntent(this.mouse.x, this.mouse.y);
    if (kind !== this.cursorKind) {
      this.cursorKind = kind;
      el.style.cursor = cursorCss(kind);
    }
  }

  /**
   * Ce que ferait un clic à l'écran (x, y), pour le curseur : mêmes règles que le clic droit
   * (contextCommand) et que les modes d'ordre (modeClick).
   */
  private cursorIntent(x: number, y: number): CursorKind {
    if (this.middle.active) return "grab";
    if (this.mouse.down && this.mouse.button === 2 && this.mouse.dragging) return this.formStart ? "move" : "grab";
    if (!this.data || !this.frame) return "default";
    const mode = ui.mode;
    const playing = ui.me >= 0 && !ui.spectator && !ui.replay;
    if (mode === "build" || mode === "paste") return this.ghostCells.some((c) => !c.ok) ? "invalid" : "build";
    if (mode === "copy") return "select";
    const g = this.groundAt(x, y);
    if (!g) return mode ? "invalid" : "default";
    const unit = this.ownedUnitAt(x, y, true);
    const tb = this.buildingAtTile(Math.floor(g.x), Math.floor(g.z));
    const mine = (owner: number) => owner === ui.me;
    const enemy = (owner: number) => this.teamOf(owner) !== this.teamOf(ui.me);
    if (mode) {
      switch (mode) {
        case "attackMove":
          return "attackMove";
        case "patrol":
          return "patrol";
        case "reclaim":
          return "reclaim";
        case "harvest": {
          const s = this.spotAt(Math.floor(g.x), Math.floor(g.z));
          return s && this.harvestRecipe(s.kind) >= 0 ? "harvest" : "invalid";
        }
        case "unload":
          return "unload";
        case "assist":
          return (unit && !enemy(unit.owner)) || (tb && !enemy(tb.owner)) ? "assist" : "invalid";
        default:
          return "target";
      }
    }
    const units = playing ? this.selectedUnits() : [];
    if (!units.length) {
      // rien de sélectionné (ou spectateur) : ce qui peut être sélectionné sous la souris
      if (playing && ui.selBuilding && mine(ui.selBuilding.owner) && this.data.buildings[ui.selBuilding.kind]?.cls === BClass.Factory) return "rally";
      if (unit && (mine(unit.owner) || !playing)) return "select";
      if (tb && (mine(tb.owner) || !playing)) return "select";
      return "default";
    }
    const ids = units.map((u) => u.id);
    if (unit && enemy(unit.owner)) return "attack";
    if (tb && enemy(tb.owner)) return "attack";
    const engs = units.some((u) => this.data!.units[u.kind].buildPower > 0);
    if (unit && mine(unit.owner) && !ids.includes(unit.id)) return this.data.units[unit.kind].carry > 0 ? "load" : "assist";
    if (tb && mine(tb.owner)) {
      const def = this.data.buildings[tb.kind];
      if (def.cls === BClass.Gate) return "move";
      if (engs && (tb.build < 65536 || tb.hp < def.hp)) return "repair";
      if (def.cls === BClass.Belt && tb.owner === ui.me && units.some((u) => this.data!.units[u.kind].key === "commander")) return "load";
    }
    if (!tb && units.some((u) => this.data!.units[u.kind].key === "commander")) {
      const s = this.spotAt(Math.floor(g.x), Math.floor(g.z));
      if (s && this.harvestRecipe(s.kind) >= 0) return "harvest";
    }
    if (engs) {
      const f = this.frame;
      for (let i = 0, o = f.wreckOff; i < f.nWrecks; i++, o += WRECK_WORDS) {
        if (Math.hypot(f.buf[o] / TILE - g.x, f.buf[o + 1] / TILE - g.z) < 1.5) return "reclaim";
      }
    }
    return "move";
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
      // commandant sur un de nos tapis : il s'y poste et récupère les objets qui passent (stock commun)
      const cmdrs = units.filter((u) => this.data!.units[u.kind].key === "commander").map((u) => u.id);
      if (def.cls === BClass.Belt && cmdrs.length) {
        this.cmd(Ord.target(O.COLLECT, cmdrs, tb.ref, queue));
        const rest = units.filter((u) => !cmdrs.includes(u.id));
        if (rest.length) this.cmd(Ord.move(rest, gx, gy, queue, false));
        this.scene?.addMarker(g.x, g.z, 0xffd060);
        pushMessage("Commandant : récupération des objets du tapis (versés au stock)", "info");
        sfx.confirm();
        return;
      }
    }
    // commandant sur un gisement libre (sans extracteur) : récolte avec sa fonderie intégrée
    if (!tb && this.harvestAt(units, g.x, g.z, queue, false)) return;
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

  /** Gisement (2 x 2 cases) qui couvre la case (tx, tz), s'il y en a un. */
  private spotAt(tx: number, tz: number): { kind: number; x: number; y: number } | null {
    return this.map?.spots.find((p) => tx >= p.x && tx < p.x + 2 && tz >= p.y && tz < p.y + 2) ?? null;
  }

  /**
   * Recette de fonderie utilisée par la récolte du commandant sur un gisement de la ressource `raw`,
   * ou -1 (hydrocarbure, cristal, ou recette pas encore débloquée : la plaquette de silicium demande
   * l'électronique). Même règle que la simulation (units::harvest_recipe).
   */
  harvestRecipe(raw: number): number {
    if (!this.data) return -1;
    const r = smeltRecipe(this.data, raw);
    if (r < 0) return -1;
    const me = this.frame?.players[ui.me];
    return !me || hasTech(me, this.data.recipes[r].tech) ? r : -1;
  }

  /** Commandants parmi les unités. */
  private commandersOf(units: { id: number; kind: number }[]): number[] {
    return units.filter((u) => this.data!.units[u.kind].key === "commander").map((u) => u.id);
  }

  /**
   * Ordre de récolte au point (x, z) de la carte pour les commandants de `units` (les autres unités s'y
   * rendent). Faux si rien n'est récoltable là ; `explain` dit alors pourquoi.
   */
  private harvestAt(units: { id: number; kind: number; x: number; y: number }[], x: number, z: number, queue: boolean, explain: boolean): boolean {
    const tx = Math.floor(x);
    const tz = Math.floor(z);
    const spot = this.spotAt(tx, tz);
    const cmdrs = this.commandersOf(units);
    const fail = (msg: string): boolean => {
      if (explain) {
        pushMessage(msg, "alert");
        sfx.error();
      }
      return false;
    };
    if (!cmdrs.length) return fail("Récolte : sélectionnez votre commandant");
    if (!spot) return fail("Récolte : cliquez sur un gisement de minerai de fer, de cuivre ou de silicium");
    const items = this.data!.items;
    const r = this.harvestRecipe(spot.kind);
    if (r < 0) {
      const sr = smeltRecipe(this.data!, spot.kind);
      return fail(sr < 0 ? `Récolte : la fonderie du commandant ne sait pas fondre ${items[spot.kind]?.name.toLowerCase() ?? "ce gisement"}` : `Récolte : la recette « ${items[this.data!.recipes[sr].output[0]]?.name} » n'est pas encore recherchée`);
    }
    this.cmd(Ord.harvest(cmdrs, tx, tz, queue));
    const rest = units.filter((u) => !cmdrs.includes(u.id));
    if (rest.length) this.cmd(Ord.move(rest, Math.round(x * TILE), Math.round(z * TILE), queue, false));
    this.scene?.addMarker(x, z, 0xff9a3c);
    const rec = this.data!.recipes[r];
    pushMessage(`Commandant : récolte du ${items[spot.kind]?.name.toLowerCase()}, fondu en ${items[rec.output[0]]?.name.toLowerCase()} (versé au stock)`, "info");
    sfx.confirm();
    return true;
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
      case "harvest":
        if (!this.harvestAt(units, g.x, g.z, queue, true)) return;
        if (!queue) this.cancelMode();
        return;
      case "teleport":
      case "jump": {
        const src = units.find((u) => (mode === "teleport" ? this.data!.units[u.kind].key === "commander" : this.data!.units[u.kind].key === "hyper_cruiser"));
        // saut hyperespace : seulement vers une de nos balises (alimentée, vérifié par la simulation)
        if (mode === "jump" && !(tb && tb.owner === ui.me && this.data!.buildings[tb.kind]?.cls === BClass.Beacon)) {
          pushMessage("Saut hyperespace : cliquez sur une de vos balises d'hyperespace", "alert");
          sfx.error();
          return;
        }
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
    if (ui.mode === "copy" || ui.mode === "paste") this.cancelMode();
    ui.buildKind = kind;
    ui.mode = "build";
    this.resetLine();
    this.beltForced = false;
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

  /** File en L de `a` à `b` : premier tronçon horizontal si `horizFirst` (axe choisi par le geste, Belts.lockAxis). */
  private lineCells(a: { x: number; y: number }, b: { x: number; y: number }, horizFirst: boolean): { x: number; y: number; dir: number }[] {
    const def = this.data!.buildings[ui.buildKind];
    const step = def.cls === BClass.Pylon ? 7 : def.w;
    const out: { x: number; y: number; dir: number }[] = [];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const sx = Math.sign(dx) || 1;
    const sy = Math.sign(dy) || 1;
    const hdir = sx > 0 ? 0 : 2;
    const vdir = sy > 0 ? 1 : 3;
    const isBelt = def.cls === BClass.Belt;
    // rails : orientés dans le sens de leur segment (la voie se relie par simple contact ; la direction
    // ne sert qu'au modèle : direction 0, rails selon x ; direction 1, rails selon z)
    const isRail = def.cls === BClass.Rail;
    const along = (dir: number, horiz: boolean) => (isBelt ? dir : isRail ? (horiz ? 0 : 1) : ui.buildDir);
    if (horizFirst) {
      for (let i = 0; i <= Math.abs(dx); i += step) out.push({ x: a.x + i * sx, y: a.y, dir: along(dy !== 0 && i === Math.abs(dx) ? vdir : hdir, dx !== 0 || dy === 0) });
      for (let j = step; j <= Math.abs(dy); j += step) out.push({ x: b.x, y: a.y + j * sy, dir: along(vdir, false) });
    } else {
      for (let j = 0; j <= Math.abs(dy); j += step) out.push({ x: a.x, y: a.y + j * sy, dir: along(dx !== 0 && j === Math.abs(dy) ? hdir : vdir, false) });
      for (let i = step; i <= Math.abs(dx); i += step) out.push({ x: a.x + i * sx, y: b.y, dir: along(hdir, true) });
    }
    return out.slice(0, 200);
  }

  /** Nos tapis, bras et tapis de contrôle terminés parmi la sélection (ordre ROTATE). */
  private rotatableSelection(): number[] {
    // plusieurs bâtiments sélectionnés : seule la démolition est possible
    if (ui.me < 0 || !this.data || this.selected.size !== 1) return [];
    const out: number[] = [];
    for (const id of this.selected) {
      if (!Ord.isBuildingRef(id)) continue;
      const b = this.findBuilding(id);
      const cls = b ? this.data.buildings[b.kind]?.cls : -1;
      if (b && b.owner === ui.me && (cls === BClass.Belt || cls === BClass.Inserter || cls === BClass.Router)) out.push(id);
    }
    return out;
  }

  /** file de tapis en cours de tracé : direction de la dernière case choisie avec R (null : automatique) */
  lineEndDir: number | null = null;
  /** file en cours de tracé : partie figée par un changement de niveau (molette), avec le niveau de chaque case */
  private lineFrozen: { x: number; y: number; dir: number; floor: number }[] = [];
  /** axe du premier tronçon du tronçon en cours (Belts.lockAxis), null tant que le curseur est sur son départ */
  private lineAxis: "h" | "v" | null = null;
  /** Fin du tracé d'une file : la prochaine repart de zéro, au sol. */
  private resetLine(): void {
    this.ghostStart = null;
    this.lineFrozen = [];
    this.lineAxis = null;
    this.lineEndDir = null;
    ui.buildFloor = 0;
  }

  /** pose de tapis : direction forcée par R (sinon déduite des tapis voisins) */
  beltForced = false;
  isBeltKind(): boolean {
    return this.data?.buildings[ui.buildKind]?.cls === BClass.Belt;
  }
  /** Pose logistique (tapis, tapis de contrôle, bras) : elle peut remplacer nos tapis existants. */
  /** Toute pose du joueur peut remplacer ses tapis (un bâtiment posé dessus les démonte). */
  private replaceFlag(): number {
    return ui.buildKind >= 0 ? 4 : 0;
  }
  /** Tapis complets visibles (toutes équipes) : case -> { direction, propriétaire }. */
  private beltTiles(): Map<number, { dir: number; owner: number }> {
    const m = new Map<number, { dir: number; owner: number }>();
    const f = this.frame;
    if (!f || !this.data || !this.map) return m;
    for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      const kind = f.buf[o + 1] & 0xff;
      if (this.data.buildings[kind]?.cls !== BClass.Belt || f.buf[o + 4] < 65536) continue;
      if ((f.buf[o + 1] >>> 28) & 3) continue; // tapis surélevé
      const x = f.buf[o + 2] & 0xffff;
      const y = (f.buf[o + 2] >>> 16) & 0xffff;
      m.set(y * this.map.w + x, { dir: (f.buf[o + 1] >> 16) & 3, owner: (f.buf[o + 1] >> 8) & 0xff });
    }
    return m;
  }
  /** Répartiteurs terminés : case -> direction, sorties (masque de directions) et propriétaire. */
  private splitterTiles(): Map<number, { dir: number; outs: number; owner: number }> {
    const m = new Map<number, { dir: number; outs: number; owner: number }>();
    const f = this.frame;
    if (!f || !this.data || !this.map) return m;
    for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      if (this.data.buildings[f.buf[o + 1] & 0xff]?.key !== "splitter" || f.buf[o + 4] < 65536) continue;
      const dir = (f.buf[o + 1] >> 16) & 3;
      const x = f.buf[o + 2] & 0xffff;
      const y = (f.buf[o + 2] >>> 16) & 0xffff;
      m.set(y * this.map.w + x, { dir, outs: Belts.splitterOuts(dir, (f.buf[o + 5] >>> 24) & 3), owner: (f.buf[o + 1] >> 8) & 0xff });
    }
    return m;
  }
  /** Voisins « tapis » (tapis et répartiteurs ; seulement les nôtres si `mine`) pour belts.ts. */
  private beltNeighbours(belts: Map<number, { dir: number; owner: number }>, splitters: Map<number, { dir: number; outs: number; owner: number }>, mine: boolean): Belts.BeltNeighbours {
    const W = this.map!.w;
    const H = this.map!.h;
    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
    return {
      belt: (x, y) => {
        const b = inside(x, y) ? belts.get(y * W + x) : undefined;
        return b && (!mine || b.owner === ui.me) ? b.dir : undefined;
      },
      // un tapis (posé ou en cours de pose) sur la case l'emporte
      splitter: (x, y) => {
        if (!inside(x, y) || belts.has(y * W + x)) return 0;
        const s = splitters.get(y * W + x);
        return s && (!mine || s.owner === ui.me) ? s.outs : 0;
      },
    };
  }
  private ghostSeq = 0;
  private async updateGhost(): Promise<void> {
    if (ui.mode !== "build" || ui.buildKind < 0 || !this.scene || !this.data) return;
    const g = this.groundAt(this.mouse.x, this.mouse.y);
    if (!g) return;
    const def = this.data.buildings[ui.buildKind];
    const cur = this.snapBuild(g);
    // machines qui peuvent se jumeler : une rangée se pose en glissant
    const machine = isMachine(def.cls);
    const lineable = def.cls === BClass.Belt || def.cls === BClass.Rail || def.cls === BClass.Wall || def.cls === BClass.Pylon || machine;
    const isBelt = def.cls === BClass.Belt;
    const belts = isBelt ? this.beltTiles() : new Map<number, { dir: number; owner: number }>();
    const splitters = isBelt ? this.splitterTiles() : new Map<number, { dir: number; outs: number; owner: number }>();
    // direction automatique d'un tapis posé seul : il prolonge ce qui débouche sur sa case, ou alimente un voisin
    const autoDir = (x: number, y: number) => {
      const s = (sx: number, sy: number) => {
        const e = this.map && sx >= 0 && sy >= 0 ? splitters.get(sy * this.map.w + sx) : undefined;
        return e && e.owner === ui.me ? e.dir : undefined;
      };
      return Belts.autoBeltDir(x, y, this.beltNeighbours(belts, splitters, true), s, ui.buildDir);
    };
    // file : partie figée (changements de niveau) puis tronçon en cours, de sa dernière case au curseur ; le
    // sens de l'angle suit le geste (axe le long duquel le curseur a quitté le départ du tronçon)
    const drawing = this.mouse.down && this.ghostStart && lineable;
    const frozen = drawing && isBelt ? this.lineFrozen : [];
    const nf = frozen.length;
    let cells: { x: number; y: number; dir: number }[];
    if (drawing && machine) cells = machineRow(this.ghostStart!, cur, def, ui.buildDir);
    else if (drawing) {
      const segStart = nf ? frozen[nf - 1] : this.ghostStart!;
      this.lineAxis = Belts.lockAxis(segStart, cur, this.lineAxis);
      const dx = Math.abs(cur.x - segStart.x);
      const dy = Math.abs(cur.y - segStart.y);
      cells = Belts.joinSegment(frozen, this.lineCells(segStart, cur, this.lineAxis ? this.lineAxis === "h" : dx >= dy));
      // fin de file tournée avec R pendant le tracé
      if (isBelt && this.lineEndDir !== null && cells.length > Math.max(1, nf)) cells[cells.length - 1].dir = this.lineEndDir;
    } else cells = [{ ...cur, dir: isBelt && !this.beltForced ? autoDir(cur.x, cur.y) : ui.buildDir }];
    /** un de nos tapis au sol sur la case, perpendiculaire à la direction `dir` */
    const across = (c: { x: number; y: number; dir: number }): boolean => {
      const e = this.map ? belts.get(c.y * this.map.w + c.x) : undefined;
      return !!e && e.owner === ui.me && (e.dir & 1) !== (c.dir & 1);
    };
    // file qui finit en travers d'un de nos tapis : on veut s'y brancher (la file s'arrête juste avant
    // et le nourrit par le côté), pas l'enjamber ni le tourner ; sauf si sa fin a été tournée avec R
    if (isBelt && ui.buildFloor === 0 && cells.length > Math.max(1, nf) && this.lineEndDir === null && across(cells[cells.length - 1])) cells.pop();
    const seq = ++this.ghostSeq;
    const rf = this.replaceFlag();
    const base = isBelt ? ui.buildFloor : 0;
    // pose possible de chaque case à un niveau donné
    const canAt = async (floor: number): Promise<boolean[]> => {
      const args = [ui.me, ui.buildKind];
      for (const c of cells) args.push(c.x, c.y, c.dir | rf | ((floor & 3) << 3));
      return (await this.query<boolean[]>("canPlaceMany", args)) ?? [];
    };
    let floors = cells.map(() => base);
    let okAt = await canAt(base);
    if (isBelt) {
      // file de tapis : la partie figée garde ses niveaux ; le tronçon en cours part du niveau choisi et
      // monte de lui-même au-dessus des obstacles (bâtiment, eau, falaise, autre file qui la croise) ; les
      // ascenseurs se forment aux changements de niveau
      const at: boolean[][] = [];
      for (let f = 0; f <= 2; f++) at.push(f === base ? okAt : cells.length > 1 && (f > base || frozen.some((c) => c.floor === f)) ? await canAt(f) : cells.map(() => false));
      // un de nos tapis au sol qui croise la file (perpendiculaire) : on passe au-dessus au lieu de le
      // tourner ; sauf la case de départ : partir d'un tapis, c'est le prolonger en faisant un angle
      const crossing = cells.map((c, i) => i > 0 && across(c));
      const r = Belts.lineFloors(cells, Math.min(nf, cells.length), frozen.map((c) => c.floor), base, at, crossing);
      floors = r.floors;
      okAt = r.ok;
    }
    // jumelages qui se formeront : règle de la simulation, avec la recette que prendra chaque machine
    // (générateurs : combustible partagé avec les générateurs collés)
    let twins: number[] = [];
    if (machine || def.cls === BClass.Power) {
      const args = [ui.me, ui.buildKind];
      for (const c of cells) args.push(c.x, c.y, c.dir | rf);
      twins = (await this.query<number[] | null>("twinPreview", args)) ?? [];
    }
    if (seq !== this.ghostSeq || ui.mode !== "build") return;
    this.scene.ghostLift = 0;
    this.ghostCells = cells.map((c, i) => ({ ...c, ok: !!okAt[i], floor: isBelt ? floors[i] : 0, twins: twins[i] ?? 0 }));
    // aperçu des virages : forme d'après les tapis existants et les autres tapis en cours de pose
    if (isBelt && this.map) {
      for (const c of this.ghostCells) belts.set(c.y * this.map.w + c.x, { dir: c.dir, owner: ui.me });
      const n = this.beltNeighbours(belts, splitters, false);
      this.scene.setGhost(ui.buildKind, this.ghostCells.map((c) => ({ ...c, shape: Belts.beltShape(c.x, c.y, c.dir, n) })));
    } else if (this.data?.buildings[ui.buildKind]?.key === "splitter") {
      this.scene.setGhost(ui.buildKind, this.ghostCells.map((c) => ({ ...c, shape: ui.buildSplit })));
    } else this.scene.setGhost(ui.buildKind, this.ghostCells);
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
    const rf = this.replaceFlag();
    // niveau propre à chaque case (montée automatique au-dessus des obstacles)
    // répartiteur : ses sorties dans les bits 5-6 de la direction
    const split = this.data?.buildings[ui.buildKind]?.key === "splitter" ? (ui.buildSplit & 3) << 5 : 0;
    cells.forEach((c, i) => this.cmd(Ord.build(engs, ui.buildKind, c.x, c.y, c.dir | rf | (((c.floor ?? 0) & 3) << 3) | split, shift || i > 0)));
    sfx.confirm();
    this.resetLine();
    if (!shift) {
      const def = this.data!.buildings[ui.buildKind];
      if (!(def.cls === BClass.Belt || def.cls === BClass.Rail || def.cls === BClass.Wall || def.cls === BClass.Pylon || def.cls === BClass.Inserter)) this.cancelMode();
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
  /** dernière modification locale de la file de recherche (l'affichage optimiste prime un instant) */
  researchEdit = 0;
  clearResearchQueue(): void {
    this.researchEdit = performance.now();
    this.cmd(Ord.researchQueue(0));
    ui.researchQueue = [];
    sfx.click();
  }
  /** Lance la recherche tout de suite (Maj+clic). */
  research(t: number): void {
    this.researchEdit = performance.now();
    this.cmd(Ord.research(t));
    ui.researchQueue = ui.researchQueue.filter((q) => q !== t);
    sfx.confirm();
  }
  /**
   * Clic sur une recherche : en file (précédée de ses prérequis manquants, dans l'ordre) ; si elle y
   * est déjà, retirée. Sans recherche en cours, la première démarre aussitôt.
   */
  queueResearch(t: number): void {
    const d = this.data;
    if (!d || ui.me < 0) return;
    this.researchEdit = performance.now();
    if (ui.researchQueue.includes(t)) {
      this.cmd(Ord.researchQueue(t));
      ui.researchQueue = ui.researchQueue.filter((q) => q !== t);
      sfx.click();
      return;
    }
    const have = (q: number) => hasTechUI(q) || ui.research === q || ui.researchQueue.includes(q);
    const chain: number[] = [];
    const visit = (q: number) => {
      if (have(q) || chain.includes(q)) return;
      for (const r of d.techs[q].prereq) visit(r);
      chain.push(q);
    };
    visit(t);
    for (const q of chain) this.cmd(Ord.researchQueue(q));
    // affichage immédiat (la simulation confirme au prochain relevé)
    const rest = !ui.research ? chain.slice(1) : chain;
    if (!ui.research && chain.length) ui.research = chain[0];
    ui.researchQueue = [...ui.researchQueue, ...rest];
    sfx.confirm();
  }
  toggleBuilding(): void {
    if (ui.selBuilding) this.cmd(Ord.toggle(ui.selBuilding.ref));
  }
  /** Part de la sortie de sa source prise par le bras sélectionné (%, 0 : automatique). */
  /** Améliore le bâtiment sélectionné d'un niveau (extracteur). */
  upgradeBuilding(): void {
    if (ui.selBuilding) {
      this.cmd(Ord.upgrade(ui.selBuilding.ref));
      sfx.confirm();
    }
  }
  /** Sorties du répartiteur sélectionné (0 : les trois, 1 : gauche et avant, 2 : droite et avant). */
  setSplit(mode: number): void {
    if (ui.selBuilding) this.cmd(Ord.setSplit(ui.selBuilding.ref, mode));
  }
  /** Cadence de la machine sélectionnée (10 à 250 %, par pas de 10 ; au-dessus de 100 %, des fragments d'énergie). */
  setClock(clock: number): void {
    if (ui.selBuilding) {
      this.cmd(Ord.setClock(ui.selBuilding.ref, clock));
      sfx.click();
    }
  }
  /** Rotation du bras sélectionné, en quarts de tour (1 : prend à droite, 2 : derrière, 3 : à gauche). */
  /** Objets par voyage des véhicules qui partent de la gare sélectionnée (0 : automatique). */
  setLot(n: number): void {
    if (ui.selBuilding) this.cmd(Ord.setLot(ui.selBuilding.ref, n));
  }
  /** Vide une gare ou un héliport : son contenu retourne au stock. */
  emptyStash(): void {
    if (ui.selBuilding) this.cmd(Ord.emptyStash(ui.selBuilding.ref));
  }
  setTurn(quarters: number): void {
    if (ui.selBuilding) this.cmd(Ord.setTurn(ui.selBuilding.ref, quarters));
  }
  /** Objets remis en sortie par le dépôt amélioré sélectionné. */
  setFilters(items: number[]): void {
    if (ui.selBuilding) this.cmd(Ord.setFilters(ui.selBuilding.ref, items));
  }
  setShare(pct: number): void {
    if (ui.selBuilding) this.cmd(Ord.setShare(ui.selBuilding.ref, pct));
  }
  cancelBuilding(): void {
    if (ui.selBuilding) this.cmd(Ord.cancel(ui.selBuilding.ref));
  }

  /**
   * Touche Suppr : le bâtiment sélectionné est démonté par nos constructeurs les plus proches (libres
   * d'abord) ; un chantier est annulé tout de suite. Avec des ingénieurs sélectionnés : recyclage en zone.
   */
  demolishSelected(): void {
    if (ui.selPlan && !this.selected.size) {
      this.cancelPlan();
      return;
    }
    if (ui.selBuildings.length > 1) {
      this.demolishMany(ui.selBuildings.filter((b) => b.owner === ui.me).map((b) => b.ref));
      return;
    }
    const sb = ui.selBuilding;
    if (sb && sb.owner === ui.me) {
      const f = this.frame;
      let build = 65536;
      let cx = 0;
      let cy = 0;
      const d = this.data!.buildings[sb.kind];
      if (f) {
        for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
          if (f.buf[o] >>> 0 !== sb.ref) continue;
          build = f.buf[o + 4];
          const dir = (f.buf[o + 1] >> 16) & 3;
          cx = (f.buf[o + 2] & 0xffff) + (dir & 1 ? d.h : d.w) / 2;
          cy = ((f.buf[o + 2] >>> 16) & 0xffff) + (dir & 1 ? d.w : d.h) / 2;
        }
      }
      if (build < 65536) {
        this.cmd(Ord.cancel(sb.ref));
        sfx.confirm();
        return;
      }
      const builders = this.ownBuilders().sort((a, b) => Number(!a.idle) - Number(!b.idle) || Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
      if (!builders.length) {
        pushMessage("Aucun constructeur pour démonter ce bâtiment", "alert");
        sfx.error();
        return;
      }
      for (const b of builders.slice(0, 2)) this.cmd(Ord.target(O.RECLAIM, [b.id], sb.ref, !b.idle));
      this.scene?.addMarker(cx, cy, 0xffd060);
      sfx.confirm();
      return;
    }
    if (this.engineers().length) this.setMode("reclaim");
  }

  /** Nos constructeurs (ingénieurs et commandant) : position en cases, inactifs (sans ordre) ou non. */
  private ownBuilders(): { id: number; x: number; y: number; idle: boolean }[] {
    const f = this.frame;
    const out: { id: number; x: number; y: number; idle: boolean }[] = [];
    if (!f || !this.data) return out;
    for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += UNIT_WORDS) {
      const w1 = f.buf[o + 1];
      if (((w1 >> 8) & 0xff) !== ui.me || !(this.data.units[w1 & 0xff]?.buildPower > 0)) continue;
      out.push({ id: f.buf[o] >>> 0, x: f.buf[o + 2] / TILE, y: f.buf[o + 3] / TILE, idle: (((w1 >>> 16) & 0xff) & UF.IDLE) !== 0 });
    }
    return out;
  }

  /**
   * Recyclage en zone (cadre à l'écran) : nos bâtiments (chantiers annulés directement) et les épaves.
   * Les cibles sont réparties entre les constructeurs sélectionnés (sinon les plus proches), chacun
   * enchaînant les plus proches de sa position précédente, avec une charge équilibrée.
   */
  private async reclaimArea(x0: number, y0: number, x1: number, y1: number, queue: boolean): Promise<void> {
    const sc = this.scene;
    const f = this.frame;
    if (!sc || !f || !this.data || !this.map) return;
    const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
    const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
    const p = { x: 0, y: 0 };
    const inBox = (x: number, z: number) => sc.project(x, groundHeight(this.map!, x, z) + 0.3, z, p) && p.x >= ax && p.x <= bx && p.y >= ay && p.y <= by;
    const targets: { ref: number; x: number; y: number }[] = [];
    let cancelled = 0;
    // bâtiments à reconstruire (fantômes) du cadre : oubliés
    const corners = [this.groundAt(ax, ay), this.groundAt(bx, ay), this.groundAt(ax, by), this.groundAt(bx, by)].filter((c): c is NonNullable<typeof c> => !!c);
    if (corners.length) {
      const xs = corners.map((c) => c.x);
      const zs = corners.map((c) => c.z);
      this.cmd(Ord.cancelGhosts(Math.floor(Math.min(...xs)), Math.floor(Math.min(...zs)), Math.floor(Math.max(...xs)), Math.floor(Math.max(...zs))));
    }
    for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      const w1 = f.buf[o + 1];
      if (((w1 >> 8) & 0xff) !== ui.me) continue;
      const d = this.data.buildings[w1 & 0xff];
      const dir = (w1 >> 16) & 3;
      const x = (f.buf[o + 2] & 0xffff) + (dir & 1 ? d.h : d.w) / 2;
      const y = ((f.buf[o + 2] >>> 16) & 0xffff) + (dir & 1 ? d.w : d.h) / 2;
      if (!inBox(x, y)) continue;
      if (f.buf[o + 4] < 65536) {
        this.cmd(Ord.cancel(f.buf[o] >>> 0));
        cancelled++;
      } else targets.push({ ref: f.buf[o] >>> 0, x, y });
    }
    const wrecks: { x: number; y: number }[] = [];
    for (let i = 0, o = f.wreckOff; i < f.nWrecks; i++, o += WRECK_WORDS) {
      const x = f.buf[o] / TILE;
      const y = f.buf[o + 1] / TILE;
      if (inBox(x, y)) wrecks.push({ x, y });
    }
    for (const wk of wrecks.slice(0, 80)) {
      const ref = await this.query<number>("wreckAt", [Math.round(wk.x * TILE), Math.round(wk.y * TILE)]);
      if (ref && !targets.some((t) => t.ref === ref)) targets.push({ ref, x: wk.x, y: wk.y });
    }
    if (!targets.length) {
      if (cancelled) sfx.confirm();
      else sfx.error();
      return;
    }
    this.assignReclaim(targets, queue);
  }

  /** Démolit plusieurs de nos bâtiments : chantiers annulés tout de suite, les autres répartis entre les constructeurs. */
  private demolishMany(refs: number[]): void {
    const f = this.frame;
    if (!f || !this.data) return;
    const want = new Set(refs);
    const targets: { ref: number; x: number; y: number }[] = [];
    let cancelled = 0;
    for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      const ref = f.buf[o] >>> 0;
      if (!want.has(ref)) continue;
      const w1 = f.buf[o + 1];
      const d = this.data.buildings[w1 & 0xff];
      const dir = (w1 >> 16) & 3;
      const x = (f.buf[o + 2] & 0xffff) + (dir & 1 ? d.h : d.w) / 2;
      const y = ((f.buf[o + 2] >>> 16) & 0xffff) + (dir & 1 ? d.w : d.h) / 2;
      if (f.buf[o + 4] < 65536) {
        this.cmd(Ord.cancel(ref));
        cancelled++;
      } else targets.push({ ref, x, y });
    }
    if (targets.length) this.assignReclaim(targets, false);
    else if (cancelled) sfx.confirm();
    else sfx.error();
  }

  /**
   * Répartit des cibles de recyclage entre les constructeurs sélectionnés (sinon les 3 plus proches) :
   * chacun enchaîne les plus proches de sa position précédente, avec une charge équilibrée.
   */
  private assignReclaim(targets: { ref: number; x: number; y: number }[], queue: boolean): void {
    const sel = new Set(this.engineers());
    let builders = this.ownBuilders().filter((b) => sel.has(b.id));
    if (!builders.length) {
      // aucun ingénieur sélectionné : les 3 constructeurs les plus proches de la zone
      const cx = targets.reduce((s, t) => s + t.x, 0) / targets.length;
      const cy = targets.reduce((s, t) => s + t.y, 0) / targets.length;
      builders = this.ownBuilders().sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy)).slice(0, 3);
    }
    if (!builders.length) {
      pushMessage("Aucun constructeur pour recycler cette zone", "alert");
      sfx.error();
      return;
    }
    const plan = builders.map((b) => ({ id: b.id, x: b.x, y: b.y, list: [] as number[] }));
    const left = targets.slice(0, 300);
    while (left.length) {
      // le couple (constructeur, cible) le moins coûteux : trajet depuis sa dernière cible + charge
      let best = 0;
      let bi = 0;
      let bc = Infinity;
      for (let k = 0; k < plan.length; k++) {
        const pl = plan[k];
        for (let i = 0; i < left.length; i++) {
          const c = Math.hypot(left[i].x - pl.x, left[i].y - pl.y) + pl.list.length * 6;
          if (c < bc) {
            bc = c;
            best = i;
            bi = k;
          }
        }
      }
      const t = left.splice(best, 1)[0];
      const pl = plan[bi];
      pl.list.push(t.ref);
      pl.x = t.x;
      pl.y = t.y;
    }
    for (const pl of plan) pl.list.forEach((ref, i) => this.cmd(Ord.target(O.RECLAIM, [pl.id], ref, queue || i > 0)));
    sfx.confirm();
    pushMessage(`Recyclage : ${targets.length} cible${targets.length > 1 ? "s" : ""}, ${plan.filter((p) => p.list.length).length} constructeur${plan.length > 1 ? "s" : ""}`, "info");
  }
  lastPromo = 0;
  lastOrdersQuery = 0;
  /** dernier dégât subi (base, commandant) : l'annonce ne revient qu'après un répit sans dégât */
  lastBaseHit = -1e9;
  lastCmdHit = -1e9;
  lastPowerAlert = -1e9;
  powerWasLow = false;
  /**
   * Attaque subie (événement de la simulation, au plus toutes les 2 s) : annonce vocale et message,
   * sauf si une attaque du même type a déjà été signalée sans interruption (délai remis à zéro à
   * chaque dégât : 20 s pour la base, 12 s pour le commandant).
   */
  private onAttacked(x: number, z: number, commander: boolean): void {
    const now = performance.now();
    if (commander) {
      if (now - this.lastCmdHit > 12000) {
        say("commandant");
        sfx.alert();
        pushMessage("Le robot de commandement est attaqué !", "alert");
        this.alertPos = { x, z };
      }
      this.lastCmdHit = now;
      return;
    }
    if (now - this.lastBaseHit > 20000) {
      const k = keyOf("alert");
      say("attaque");
      sfx.alert();
      pushMessage(k ? `Nous sommes attaqués (${k} pour y aller)` : "Nous sommes attaqués", "alert");
      this.alertPos = { x, z };
    }
    this.lastBaseHit = now;
  }
  lastPowerShow = 0;
  lastPlannedQuery = 0;
  gifts = new Map<string, number>();
  giftTimer = 0;

  /** Gare ou héliport sélectionné : retire ses véhicules (relier le bâtiment à lui-même). */
  removeCarriers(): void {
    const sb = ui.selBuilding;
    if (sb) this.cmd(Ord.special(sb.ref, 0, 0, sb.ref));
  }

  /** Sauvegarde de la partie sur le serveur (reprise ensuite depuis le salon). */
  saveGame(): void {
    if (ui.replay || ui.spectator) return;
    this.send({ t: "save" });
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
        else if (h - m.waterLevel < 3) [r, g, b] = [150, 140, 100]; // (carte plate : la terre est 4 au-dessus de l'eau)
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
    // brouillard (aucun en spectateur ou dans une partie sans brouillard de guerre)
    if (f.vis && !ui.spectator && ui.fog) {
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
    const seen = (x: number, z: number, bit: number) => ui.spectator || !ui.fog || !vis || (vis[Math.min(vw - 1, (z / 4) | 0) * vw + Math.min(vw - 1, (x / 4) | 0)] & bit) !== 0;
    // zones électriques de l'équipe : aplats par réseau, zones mortes en rouge
    const zones = this.zones;
    const hex = (c: number) => "#" + c.toString(16).padStart(6, "0");
    if (zones && this.scene?.power) {
      const colors = this.scene.power.colorOf;
      ctx.globalAlpha = 0.22;
      for (const p of zones.poles) {
        const c = p[5] > 0 ? colors.get(p[5]) : undefined;
        ctx.fillStyle = hex(c ?? DEAD_COLOR);
        ctx.fillRect((p[0] - p[4]) * k, (p[1] - p[4]) * k, (p[2] + 2 * p[4]) * k, (p[3] + 2 * p[4]) * k);
      }
      ctx.globalAlpha = 1;
    }
    for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      const owner = (f.buf[o + 1] >> 8) & 0xff;
      const kind = f.buf[o + 1] & 0xff;
      const def = this.data!.buildings[kind];
      const x = f.buf[o + 2] & 0xffff;
      const z = (f.buf[o + 2] >>> 16) & 0xffff;
      if (this.teamOf(owner) !== myTeam && !seen(x, z, 9)) continue;
      ctx.fillStyle = ownerHex(owner, f.players);
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
      ctx.fillStyle = this.selected.has(f.buf[o] >>> 0) ? "#ffffff" : ownerHex(owner, f.players);
      const s = big ? 4 : 2;
      ctx.fillRect(x * k - s / 2, z * k - s / 2, s, s);
    }
    // générateurs : point vert (alimenté), ambre (moins d'une minute d'autonomie), rouge (à sec)
    if (zones) {
      const autonomy = new Map<number, number>();
      for (const n of zones.nets) autonomy.set(n[0], n[7]);
      for (const p of zones.poles) {
        if (p[6] !== 1) continue;
        const a = p[5] > 0 ? (autonomy.get(p[5]) ?? -1) : -1;
        ctx.fillStyle = p[7] <= 0 ? "#ff4a3d" : a >= 0 && a < 60 ? "#ffb547" : "#4dffb0";
        ctx.beginPath();
        ctx.arc((p[0] + p[2] / 2) * k, (p[1] + p[3] / 2) * k, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.7)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    // cadre de la caméra
    const r = this.scene!.viewRect();
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 1;
    ctx.strokeRect(r[0] * k, r[1] * k, (r[2] - r[0]) * k, (r[3] - r[1]) * k);
  }

  iconDistance(): number {
    return Number(localStorage.getItem("supreme.icons") ?? "260");
  }
  setIconDistance(d: number): void {
    localStorage.setItem("supreme.icons", String(d));
    if (this.scene) this.scene.iconDistance = d;
  }

  /** Réglages graphiques (ombres, halo, quantité d'effets), mémorisés dans le navigateur. */
  setGfx(g: Partial<GfxSettings>): void {
    ui.gfx = { ...ui.gfx, ...g };
    try {
      localStorage.setItem("supreme.gfx", JSON.stringify(ui.gfx));
    } catch {
      // stockage indisponible : le réglage vaut pour cette session
    }
    this.scene?.applySettings(ui.gfx);
  }

  setVolume(v: number): void {
    ui.volume = v;
    setVolume(v);
    localStorage.setItem("supreme.volume", String(v));
  }

  /** Annonces vocales (attaques, recherche, énergie), mémorisé dans le navigateur. */
  setVoice(on: boolean): void {
    ui.voice = on;
    setVoiceEnabled(on);
    try {
      localStorage.setItem("supreme.voice", on ? "1" : "0");
    } catch {
      // stockage indisponible : le réglage vaut pour cette session
    }
    if (on) say("recherche");
  }

  /** Volume de la musique de fond (0 : coupée), mémorisé dans le navigateur. */
  setMusicVolume(v: number): void {
    ui.music = v;
    setMusicVolume(v);
    try {
      localStorage.setItem("supreme.music", String(v));
    } catch {
      // stockage indisponible : le réglage vaut pour cette session
    }
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
