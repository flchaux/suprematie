// Contrôleur de partie, réseau : connexion au relais, messages du serveur, salon, discussion, envoi des ordres,
// pause et vitesse de jeu, menu de partie, sauvegarde, abandon.
//
// Méthodes de GameClient (client.ts) sorties en fonctions libres : le client est leur premier paramètre, `c`
// (`gc` dans les fonctions qui ont déjà une variable `c`).
import * as Ord from "@supreme/shared/orders.ts";
import { ORDER_DELAY, GAME_SPEEDS } from "@supreme/shared";
import type { ServerMsg } from "@supreme/shared";
import { ui, pushMessage } from "./state.svelte.ts";
import { kb } from "./keys.svelte.ts";
import { plans } from "./plans.svelte.ts";
import { menuPauses, type MenuRole } from "./gameMenu.ts";
import type { GameClient } from "./client.ts";
import { showPing } from "./clientEvents.ts";

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

// ---------- réseau ----------
export function connect(c: GameClient, name: string): void {
  ui.name = name;
  localStorage.setItem("supreme.name", name);
  const ws = new WebSocket(wsUrl());
  c.ws = ws;
  ws.onopen = () => {
    ui.connected = true;
    const key = new URLSearchParams(location.search).get("k") ?? localStorage.getItem("supreme.key") ?? "";
    if (key) localStorage.setItem("supreme.key", key);
    ws.send(JSON.stringify({ t: "hello", name, token: token(), key }));
    clearInterval(c.pingTimer);
    c.pingTimer = window.setInterval(() => c.send({ t: "ping", time: performance.now() }), 3000);
  };
  ws.onmessage = (e) => onServer(c, JSON.parse(e.data) as ServerMsg);
  ws.onclose = () => {
    ui.connected = false;
    if (ui.replay) return;
    pushMessage("Connexion perdue, reconnexion…", "alert");
    setTimeout(() => c.connect(name), 2000);
  };
}

export function send(c: GameClient, m: unknown): void {
  if (c.ws?.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(m));
}

/** Partie solo : un seul joueur humain (la vitesse de jeu n'est réglable que dans ce cas). */
export function isSolo(c: GameClient): boolean {
  return ui.players.length > 0 && ui.players.filter((p) => !p.bot).length === 1 && !ui.spectator;
}

/** Hôte de la partie (le joueur seul d'une partie solo l'est aussi). */
export function isHost(c: GameClient): boolean {
  return !ui.spectator && ui.me >= 0 && !!ui.lobby?.players.some((p) => p.host && p.slot === ui.me);
}

/** Peut mettre en pause : en solo, l'hôte d'une partie à plusieurs, ou dans un replay. */
export function canPause(c: GameClient): boolean {
  return ui.replay || c.isSolo() || c.isHost();
}

/** Partie (ou replay) en pause. */
export function paused(c: GameClient): boolean {
  return ui.replay ? ui.replaySpeed === 0 : ui.speed === 0;
}

/** Met en pause (vitesse 0) ou reprend à la vitesse d'avant ; le serveur l'applique pour tous et l'annonce. */
export function setPaused(c: GameClient, on: boolean): void {
  if (ui.replay) {
    if (on && ui.replaySpeed !== 0) c.replayResume = ui.replaySpeed;
    c.setReplaySpeed(on ? 0 : c.replayResume || 1);
    return;
  }
  if (!c.canPause()) {
    pushMessage("Seul l'hôte peut mettre la partie en pause", "alert");
    return;
  }
  if (on) {
    if (ui.speed !== 0) c.pauseResume = ui.speed;
    c.pauseSentAt = performance.now();
    c.send({ t: "speed", speed: 0 });
  } else {
    c.send({ t: "speed", speed: ui.speed === 0 ? ui.resumeSpeed : c.pauseResume });
  }
}

/** Pause ou reprise ; part de la dernière demande si le serveur n'a pas encore répondu (deux appuis rapides). */
export function togglePause(c: GameClient): void {
  const now = performance.now();
  const on = !(now - c.pauseAskedAt < 1000 ? c.pauseAsked : c.paused());
  c.pauseAsked = on;
  c.pauseAskedAt = now;
  c.setPaused(on);
}

/** Menu de partie (Échap) : le met en pause si on en a le droit ; le refermer reprend la partie si le menu
 * l'avait mise en pause. */
export function menuRole(c: GameClient): MenuRole {
  return { solo: c.isSolo(), host: c.isHost(), spectator: ui.spectator, replay: ui.replay, ended: ui.ended };
}

export function openMenu(c: GameClient): void {
  if (ui.menuOpen) return;
  ui.menuOpen = true;
  ui.showGfx = false;
  c.menuPaused = menuPauses(c.menuRole()) && !c.paused();
  if (c.menuPaused) c.setPaused(true);
}
export function closeMenu(c: GameClient): void {
  if (!ui.menuOpen) return;
  ui.menuOpen = false;
  // la pause demandée à l'ouverture peut ne pas encore être confirmée par le serveur
  if (c.menuPaused && (c.paused() || performance.now() - c.pauseSentAt < 2000)) c.setPaused(false);
  c.menuPaused = false;
}

/** Hôte : arrête la partie pour tous (sauvegarde automatique) et revient au salon ; `load` : y ouvre la liste
 * des sauvegardes. Replay ou démo : recharge la page. */
export function quitToLobby(c: GameClient, load = false): void {
  if (ui.replay || ui.ended || c.demoOrders || !ui.connected) {
    location.reload();
    return;
  }
  if (!c.isHost()) return;
  ui.lobbySaves = load;
  c.send({ t: "quit" });
}

/** Partie arrêtée par l'hôte : on quitte l'écran de jeu pour le salon. */
function leaveGame(c: GameClient): void {
  c.worker?.terminate();
  c.worker = null;
  c.frame = null;
  c.selected.clear();
  c.menuPaused = false;
  ui.menuOpen = ui.chatOpen = ui.showResearch = ui.showStats = ui.showHelp = ui.showRecipes = ui.showGfx = false;
  plans.show = false;
  kb.buildStep = "";
  if (ui.mode) c.cancelMode();
  ui.speed = ui.resumeSpeed = 1;
  ui.pausedBy = "";
  ui.waiting = [];
  ui.gameOver = null;
  ui.ended = false;
  ui.screen = "lobby";
}

/** Vitesse de jeu suivante (+1) ou précédente (-1) parmi GAME_SPEEDS ; le serveur l'applique et l'annonce.
 * En pause, part de la vitesse de reprise (et reprend la partie). */
export function stepSpeed(c: GameClient, delta: number): void {
  if (!c.isSolo()) {
    pushMessage("La vitesse ne se règle qu'en partie solo", "alert");
    return;
  }
  // part de la dernière vitesse demandée : plusieurs appuis rapides s'enchaînent avant la réponse du serveur
  const cur = performance.now() - c.speedAskedAt < 1000 ? c.speedAsked : ui.speed === 0 ? ui.resumeSpeed : ui.speed;
  const k = GAME_SPEEDS.indexOf(cur);
  const next = GAME_SPEEDS[Math.max(0, Math.min(GAME_SPEEDS.length - 1, (k < 0 ? GAME_SPEEDS.indexOf(1) : k) + delta))];
  if (next === cur) return;
  c.speedAsked = next;
  c.speedAskedAt = performance.now();
  c.send({ t: "speed", speed: next });
}

export function lobbyAction(c: GameClient, action: string, extra: Record<string, unknown> = {}): void {
  c.send({ t: "lobby", action, ...extra });
}

export function chat(c: GameClient, text: string): void {
  if (text.trim()) c.send({ t: "chat", text });
}

export function cmd(gc: GameClient, c: Ord.Cmd): void {
  if (gc.demoOrders) {
    gc.worker?.postMessage({ type: "demoCmd", cmd: c });
    return;
  }
  if (ui.replay || ui.spectator) return;
  gc.send({ t: "cmd", tick: gc.lastTick + ORDER_DELAY, cmd: c });
}

function onServer(gc: GameClient, m: ServerMsg): void {
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
      ui.speed = ui.resumeSpeed = 1;
      ui.pausedBy = "";
      void gc.begin(m.start, null);
      ui.stats = [];
      break;
    case "snapshot":
      // la vitesse en cours (si elle n'est pas ×1, pause comprise) suit dans un message « speed »
      ui.speed = ui.resumeSpeed = 1;
      ui.pausedBy = "";
      void gc.begin(m.start, { tick: m.tick, data: Uint8Array.from(atob(m.data), (c) => c.charCodeAt(0)) });
      ui.stats = m.stats ?? [];
      break;
    case "stats":
      ui.stats = [...ui.stats, m.sample];
      break;
    case "tick":
      gc.worker?.postMessage({ type: "tick", tick: m.tick, orders: m.orders });
      break;
    case "wait":
      ui.waiting = m.who;
      break;
    case "chat":
      pushMessage(`${m.from} : ${m.text}`, "chat");
      break;
    case "mark":
      showPing(gc, m.slot, m.x, m.z);
      break;
    case "desync":
      pushMessage(`Désynchronisation détectée au tick ${m.tick} : resynchronisation…`, "alert");
      break;
    case "end": {
      const me = gc.frame?.players[ui.me];
      const won = !!me && me.team === m.winner;
      ui.gameOver = { winner: m.winner, replay: m.replay, won };
      ui.ended = true;
      if (m.stats) ui.stats = m.stats;
      break;
    }
    case "saved":
      ui.lastSaved = { name: m.name, at: performance.now() };
      pushMessage(m.auto ? `Sauvegarde automatique : ${m.name}` : `Partie sauvegardée par ${m.by} : ${m.name}`, "good");
      break;
    case "pong":
      ui.ping = Math.round(performance.now() - m.time);
      break;
    case "speed": {
      const was = ui.speed;
      ui.speed = m.speed;
      if (m.speed === 0) {
        ui.resumeSpeed = m.resume ?? 1;
        ui.pausedBy = m.by;
        if (m.by) pushMessage(`Partie mise en pause par ${m.by}`, "info");
      } else {
        ui.resumeSpeed = m.speed;
        ui.pausedBy = "";
        if (m.by) pushMessage(was === 0 ? `Partie reprise par ${m.by}` : `Vitesse de jeu ×${String(m.speed).replace(".", ",")}`, "info");
      }
      break;
    }
    case "quit":
      leaveGame(gc);
      break;
    case "error":
      ui.error = m.message;
      break;
  }
}

/** Sauvegarde de la partie sur le serveur (reprise ensuite depuis le salon). */
export function saveGame(c: GameClient): void {
  if (ui.replay || ui.spectator) return;
  c.send({ t: "save" });
}

export function surrender(c: GameClient): void {
  c.cmd(Ord.surrender());
}
