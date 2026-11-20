// Serveur : fichiers du jeu, lobby, relais WebSocket. Une seule partie à la fois.
// Accès privé : https://<hôte>/?k=<code>. Le code est dans data/key.txt (créé au premier lancement).
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import type { LobbyState, LobbyPlayer, ClientMsg, SaveMeta, Fauna } from "@supreme/shared";
import { FAUNA_LEVELS } from "@supreme/shared";
import { Game, type Peer } from "./game.ts";
import { listSaves, readSave, readSaveMeta, deleteSave, validSaveId } from "./saves.ts";
import { PERSONALITIES } from "./bots/index.ts";

const ROOT = new URL("../../..", import.meta.url).pathname;
const DIST = process.env.SUPREME_DIST ?? join(ROOT, "packages/client/dist");
const DATA = process.env.SUPREME_DATA ?? join(ROOT, "data");
const SAVES = join(DATA, "saves");
const PORT = Number(process.env.PORT ?? 3060);
mkdirSync(DATA, { recursive: true });
const keyFile = join(DATA, "key.txt");
if (!existsSync(keyFile)) writeFileSync(keyFile, randomBytes(9).toString("base64url") + "\n");
const KEY = (process.env.SUPREME_KEY ?? readFileSync(keyFile, "utf8")).trim();
const wasmPath = existsSync(join(DIST, "sim.wasm")) ? join(DIST, "sim.wasm") : join(ROOT, "packages/client/public/sim.wasm");

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

// ---------- Accès ----------
function keyOk(k: string | undefined | null): boolean {
  if (!k) return false;
  const a = Buffer.from(k);
  const b = Buffer.from(KEY);
  return a.length === b.length && timingSafeEqual(a, b);
}
function cookieKey(req: IncomingMessage): string | undefined {
  const c = req.headers.cookie ?? "";
  const m = /(?:^|;\s*)sk=([^;]+)/.exec(c);
  return m ? decodeURIComponent(m[1]) : undefined;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function deny(res: ServerResponse): void {
  res.writeHead(403, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><meta charset="utf-8"><title>Accès refusé</title><body style="background:#111820;color:#ccd;font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0"><div><h1>Accès privé</h1><p>Ouvrez le lien d'invitation complet (avec son code).</p></div>`);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const qk = url.searchParams.get("k");
  const authed = keyOk(qk) || keyOk(cookieKey(req));
  if (!authed) return deny(res);
  const headers: Record<string, string> = {
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-embedder-policy": "require-corp",
    "x-content-type-options": "nosniff",
  };
  if (keyOk(qk)) headers["set-cookie"] = `sk=${encodeURIComponent(KEY)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=31536000`;
  let path = decodeURIComponent(url.pathname);
  if (path === "/api/status") {
    res.writeHead(200, { ...headers, "content-type": "application/json" });
    res.end(JSON.stringify({ lobby: publicLobby(), game: game?.stats() ?? null }));
    return;
  }
  if (path === "/api/saves") {
    res.writeHead(200, { ...headers, "content-type": "application/json" });
    res.end(JSON.stringify(listSaves(SAVES)));
    return;
  }
  if (path === "/api/replays") {
    const dir = join(DATA, "replays");
    const list = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse() : [];
    res.writeHead(200, { ...headers, "content-type": "application/json" });
    res.end(JSON.stringify(list));
    return;
  }
  let file: string;
  if (path.startsWith("/replays/")) {
    file = normalize(join(DATA, "replays", path.slice(9)));
    if (!file.startsWith(join(DATA, "replays"))) return deny(res);
  } else {
    if (path === "/") path = "/index.html";
    file = normalize(join(DIST, path));
    if (!file.startsWith(DIST)) return deny(res);
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    file = join(DIST, "index.html");
    if (!existsSync(file)) {
      res.writeHead(404);
      res.end("introuvable");
      return;
    }
  }
  const ext = extname(file);
  headers["content-type"] = MIME[ext] ?? "application/octet-stream";
  headers["cache-control"] = path.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
  res.writeHead(200, headers);
  res.end(readFileSync(file));
});

// ---------- Lobby ----------
interface Client extends Peer {
  ws: WebSocket;
  token: string;
}
const clients = new Set<Client>();
let lobby: LobbyState = { players: [], mapSize: 512, water: true, seed: (Math.random() * 1e9) | 0, fauna: "normal", fog: true, running: false, tick: 0, save: null };
/** paramètres de carte avant le chargement d'une sauvegarde (rétablis si on l'annule) */
let preLoad: { mapSize: number; water: boolean; seed: number; fauna: Fauna; fog: boolean } | null = null;
let game: Game | null = null;
let endTimer: NodeJS.Timeout | null = null;
const tokens = new Map<string, number>(); // jeton -> emplacement

function publicLobby(): LobbyState {
  const conn = new Set([...clients].filter((c) => c.connected && c.slot >= 0).map((c) => c.slot));
  return { ...lobby, tick: game?.tick ?? 0, players: lobby.players.map((p) => ({ ...p, connected: p.bot || conn.has(p.slot) })) };
}
function broadcast(msg: unknown): void {
  const s = JSON.stringify(msg);
  for (const c of clients) if (c.ws.readyState === WebSocket.OPEN) c.ws.send(s);
}
function sendLobby(): void {
  broadcast({ t: "lobby", lobby: publicLobby() });
}
function reindex(): void {
  lobby.players.forEach((p, i) => (p.slot = i));
}
function hostSlot(): number {
  const conn = [...clients].filter((c) => c.connected && c.slot >= 0).map((c) => c.slot).sort((a, b) => a - b);
  const h = lobby.players.find((p) => p.host && conn.includes(p.slot));
  if (h) return h.slot;
  const first = lobby.players.find((p) => !p.bot && conn.includes(p.slot));
  if (first) {
    for (const p of lobby.players) p.host = p === first;
    return first.slot;
  }
  return -1;
}

function resetLobby(): void {
  game?.stop();
  game = null;
  lobby.running = false;
  lobby.save = null;
  preLoad = null;
  for (const p of lobby.players) delete p.savedName;
  lobby.seed = (Math.random() * 1e9) | 0;
  // retirer les humains déconnectés
  const conn = new Set([...clients].filter((c) => c.connected).map((c) => c.token));
  const keepTokens = new Map<number, string>();
  for (const [tok, slot] of tokens) if (conn.has(tok)) keepTokens.set(slot, tok);
  const kept: LobbyPlayer[] = [];
  const remap = new Map<number, number>();
  for (const p of lobby.players) {
    if (p.bot || keepTokens.has(p.slot)) {
      remap.set(p.slot, kept.length);
      kept.push(p);
    }
  }
  lobby.players = kept;
  reindex();
  tokens.clear();
  for (const [slot, tok] of keepTokens) if (remap.has(slot)) tokens.set(tok, remap.get(slot)!);
  for (const c of clients) c.slot = tokens.get(c.token) ?? -1;
  hostSlot();
  sendLobby();
}

// ---------- Sauvegardes dans le salon ----------
/** Clients humains (avec ou sans place), l'hôte en premier. */
function humanClients(): Client[] {
  const host = hostSlot();
  return [...clients].filter((c) => c.connected).sort((a, b) => (a.slot === host ? -1 : b.slot === host ? 1 : (a.slot < 0 ? 99 : a.slot) - (b.slot < 0 ? 99 : b.slot)));
}

/** Donne une place à un client : place vide de même nom d'abord, sinon la première place humaine vide. */
function claimFor(c: Client, wanted = -1): boolean {
  const taken = new Set([...tokens.values()]);
  const free = lobby.players.filter((p) => !p.bot && !taken.has(p.slot));
  const pick = free.find((p) => p.slot === wanted) ?? (wanted >= 0 ? undefined : free.find((p) => p.savedName === c.name) ?? free[0]);
  if (!pick) return false;
  if (c.slot >= 0) {
    // libère l'ancienne place
    const old = lobby.players[c.slot];
    if (old?.savedName) old.name = old.savedName;
  }
  tokens.set(c.token, pick.slot);
  c.slot = pick.slot;
  pick.name = c.name;
  return true;
}

/** Charge une sauvegarde dans le salon : composition, équipes et carte viennent de la sauvegarde. */
function loadSaveInLobby(meta: SaveMeta): void {
  if (!preLoad) preLoad = { mapSize: lobby.mapSize, water: lobby.water, seed: lobby.seed, fauna: lobby.fauna, fog: lobby.fog };
  const humans = humanClients();
  lobby.save = meta;
  lobby.mapSize = meta.mapSize;
  lobby.water = meta.water;
  lobby.seed = meta.seed;
  lobby.fauna = meta.fauna ?? "none";
  lobby.fog = meta.fog ?? true;
  lobby.players = meta.players.map((p, i) => ({
    slot: i,
    name: p.name,
    bot: p.bot,
    personality: p.personality,
    aix: p.aix,
    level: p.level,
    team: p.team,
    connected: p.bot,
    host: false,
    ...(p.bot ? {} : { savedName: p.name }),
  }));
  tokens.clear();
  for (const c of humans) c.slot = -1;
  // les noms identiques d'abord, puis les autres dans l'ordre (l'hôte en tête)
  for (const c of humans) {
    const same = lobby.players.find((p) => !p.bot && p.savedName === c.name && ![...tokens.values()].includes(p.slot));
    if (same) claimFor(c, same.slot);
  }
  for (const c of humans) if (c.slot < 0) claimFor(c);
  // l'hôte qui a chargé la sauvegarde reste hôte
  const host = humans[0];
  if (host && host.slot >= 0) lobby.players[host.slot].host = true;
  hostSlot();
}

/** Annule le chargement : retour à un salon normal avec les humains présents. */
function unloadSave(): void {
  const humans = humanClients();
  lobby.save = null;
  if (preLoad) Object.assign(lobby, preLoad);
  preLoad = null;
  lobby.players = [];
  tokens.clear();
  for (const c of humans) {
    if (lobby.players.length >= 8) {
      c.slot = -1;
      continue;
    }
    c.slot = lobby.players.length;
    lobby.players.push({ slot: c.slot, name: c.name, bot: false, team: c.slot, connected: true, host: false });
    tokens.set(c.token, c.slot);
  }
  hostSlot();
}

/** Places humaines de la sauvegarde encore libres. */
function missingHumans(): number {
  const taken = new Set([...clients].filter((c) => c.connected && c.slot >= 0).map((c) => c.slot));
  return lobby.players.filter((p) => !p.bot && !taken.has(p.slot)).length;
}

async function startGame(): Promise<void> {
  if (game || lobby.players.length < 1) return;
  let save = null;
  if (lobby.save) {
    // reprise : toutes les places humaines de la sauvegarde doivent être occupées
    if (missingHumans() > 0) return;
    save = readSave(SAVES, lobby.save.id);
    if (!save) {
      broadcast({ t: "error", message: "Sauvegarde introuvable ou illisible" });
      return;
    }
  }
  lobby.running = true;
  game = new Game(publicLobby(), {
    broadcast,
    peers: () => [...clients],
    log,
    onEnd: (winner, replay) => {
      broadcast({ t: "end", winner, replay: `/replays/${replay}`, stats: game?.history });
      endTimer = setTimeout(resetLobby, 30000);
    },
    onSaved: (meta, by) => broadcast({ t: "saved", name: meta.name, by, auto: meta.auto }),
  }, wasmPath, DATA);
  for (const c of clients) c.ackTick = -1;
  try {
    await game.start(save ?? undefined);
  } catch (e) {
    log("échec du lancement", e);
    game = null;
    lobby.running = false;
    broadcast({ t: "error", message: String((e as Error).message ?? e) });
    sendLobby();
    return;
  }
  if (save) for (const c of clients) game.sendSnapshot(c);
  else for (const c of clients) c.send({ t: "start", start: game.startInfo(c.slot) });
  log(save ? "partie reprise" : "partie lancée", lobby.players.map((p) => p.name).join(", "), "carte", lobby.mapSize, save ? "tick " + game.tick : "");
  sendLobby();
}

const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 1 << 20 });
wss.on("connection", (ws, req) => {
  const authedCookie = keyOk(cookieKey(req));
  const client: Client = {
    ws,
    token: "",
    slot: -1,
    name: "?",
    connected: false,
    ackTick: -1,
    send: (m) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m)),
  };
  let alive = true;
  ws.on("pong", () => (alive = true));
  const hb = setInterval(() => {
    if (!alive) ws.terminate();
    alive = false;
    ws.ping();
  }, 15000);
  ws.on("message", (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!client.connected) {
      if (msg.t !== "hello") return;
      if (!authedCookie && !keyOk(msg.key)) {
        client.send({ t: "error", message: "Code d'accès invalide" });
        ws.close();
        return;
      }
      client.name = String(msg.name || "Joueur").slice(0, 20).replace(/[<>]/g, "");
      client.token = /^[a-zA-Z0-9_-]{8,64}$/.test(msg.token) ? msg.token : randomBytes(12).toString("base64url");
      client.connected = true;
      // reconnexion à un emplacement existant
      const existing = tokens.get(client.token);
      for (const c of clients) if (c.token === client.token && c !== client) c.ws.close();
      clients.add(client);
      if (existing !== undefined && lobby.players[existing]) {
        client.slot = existing;
        lobby.players[existing].name = client.name;
      } else if (!lobby.running && lobby.save) {
        // sauvegarde chargée : place libre de même nom, sinon première place libre, sinon spectateur
        client.slot = -1;
        claimFor(client);
      } else if (!lobby.running && lobby.players.length < 8) {
        lobby.players.push({ slot: lobby.players.length, name: client.name, bot: false, team: lobby.players.length, connected: true, host: false });
        client.slot = lobby.players.length - 1;
        tokens.set(client.token, client.slot);
      } else {
        client.slot = -1; // spectateur
      }
      hostSlot();
      client.send({ t: "welcome", token: client.token, slot: client.slot, lobby: publicLobby() });
      if (game && !game.ended) game.sendSnapshot(client);
      sendLobby();
      log("connexion", client.name, "emplacement", client.slot);
      return;
    }
    switch (msg.t) {
      case "lobby": {
        if (lobby.running) return;
        // prendre une place libre d'une sauvegarde chargée : ouvert à tous
        if (msg.action === "claimSlot") {
          if (lobby.save && claimFor(client, msg.slot ?? -1)) {
            hostSlot();
            sendLobby();
          }
          return;
        }
        if (client.slot !== hostSlot()) return;
        const s = msg.slot ?? -1;
        if (msg.action === "loadSave") {
          const meta = validSaveId(msg.id) ? readSaveMeta(SAVES, msg.id) : null;
          if (meta) loadSaveInLobby(meta);
          else client.send({ t: "error", message: "Sauvegarde introuvable" });
          sendLobby();
          return;
        }
        if (msg.action === "unloadSave") {
          if (lobby.save) unloadSave();
          sendLobby();
          return;
        }
        if (msg.action === "deleteSave") {
          if (validSaveId(msg.id) && msg.id !== lobby.save?.id) deleteSave(SAVES, msg.id);
          sendLobby();
          return;
        }
        // partie chargée : composition et paramètres fixés par la sauvegarde
        if (lobby.save && msg.action !== "start") return;
        if (msg.action === "addBot" && lobby.players.length < 8) {
          const n = lobby.players.filter((p) => p.bot).length + 1;
          const pers = PERSONALITIES.includes(msg.personality as (typeof PERSONALITIES)[number]) ? msg.personality! : "adaptive";
          lobby.players.push({ slot: lobby.players.length, name: `IA ${n}`, bot: true, personality: pers, aix: 100, level: "normal", team: lobby.players.length, connected: true, host: false });
        } else if (msg.action === "removeSlot" && lobby.players[s]?.bot) {
          lobby.players.splice(s, 1);
          reindex();
        } else if (msg.action === "setTeam" && lobby.players[s]) {
          lobby.players[s].team = Math.max(0, Math.min(7, msg.team ?? 0));
        } else if (msg.action === "setBot" && lobby.players[s]?.bot) {
          if (msg.personality && PERSONALITIES.includes(msg.personality as (typeof PERSONALITIES)[number])) lobby.players[s].personality = msg.personality;
          if (msg.aix) lobby.players[s].aix = Math.max(100, Math.min(300, msg.aix | 0));
          if (msg.level === "facile" || msg.level === "normal" || msg.level === "difficile") lobby.players[s].level = msg.level;
        } else if (msg.action === "setMap") {
          if (msg.mapSize === 512 || msg.mapSize === 1024) lobby.mapSize = msg.mapSize;
          if (typeof msg.water === "boolean") lobby.water = msg.water;
          if (Number.isInteger(msg.seed)) lobby.seed = msg.seed! | 0;
          if (msg.fauna && FAUNA_LEVELS.includes(msg.fauna)) lobby.fauna = msg.fauna;
          if (typeof msg.fog === "boolean") lobby.fog = msg.fog;
        } else if (msg.action === "start") {
          void startGame();
          return;
        }
        sendLobby();
        return;
      }
      case "cmd":
        if (game && client.slot >= 0 && !game.ended) game.submit(client.slot, msg.tick, msg.cmd);
        return;
      case "save":
        if (game && client.slot >= 0 && !game.ended && game.tick > 0) {
          if (!game.save(client.name, false)) client.send({ t: "error", message: "La sauvegarde a échoué" });
        }
        return;
      case "ack":
        if (game) game.ack(client, msg.tick, msg.hash);
        return;
      case "chat":
        broadcast({ t: "chat", from: client.name, text: String(msg.text).slice(0, 200) });
        return;
      case "speed":
        // vitesse de jeu : partie solo seulement (refusée sinon, sans message)
        if (game && !game.setSpeed(client, Number(msg.speed))) client.send({ t: "error", message: "La vitesse ne se règle qu'en partie solo" });
        return;
      case "ping":
        client.send({ t: "pong", time: msg.time });
        return;
    }
  });
  ws.on("close", () => {
    clearInterval(hb);
    clients.delete(client);
    client.connected = false;
    if (!lobby.running && client.slot >= 0 && client.token && lobby.save) {
      // sauvegarde chargée : la place redevient libre (elle garde le nom de la sauvegarde)
      if (![...clients].some((c) => c.token === client.token)) {
        tokens.delete(client.token);
        const p = lobby.players[client.slot];
        if (p?.savedName) p.name = p.savedName;
      }
    } else if (!lobby.running && client.slot >= 0 && client.token) {
      // en lobby : libérer la place
      const still = [...clients].some((c) => c.token === client.token);
      if (!still) {
        lobby.players.splice(client.slot, 1);
        tokens.delete(client.token);
        const old = client.slot;
        for (const [t, s] of tokens) if (s > old) tokens.set(t, s - 1);
        for (const c of clients) if (c.slot > old) c.slot--;
        reindex();
      }
    }
    hostSlot();
    sendLobby();
    // plus aucun humain connecté pendant une partie : arrêt après 5 minutes
    if (lobby.running && ![...clients].some((c) => c.connected)) {
      setTimeout(() => {
        if (lobby.running && ![...clients].some((c) => c.connected)) {
          log("partie abandonnée (plus personne)");
          game?.save("", true);
          if (endTimer) clearTimeout(endTimer);
          resetLobby();
        }
      }, 300000);
    }
  });
});

// arrêt du service (mise à jour, redémarrage) : la partie en cours est sauvegardée automatiquement
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    if (game && !game.ended && lobby.running) game.save("", true);
    process.exit(0);
  });
}

server.listen(PORT, "127.0.0.1", () => log(`serveur prêt sur le port ${PORT}`));
