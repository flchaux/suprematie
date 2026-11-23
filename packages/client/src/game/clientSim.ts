// Contrôleur de partie, simulation : démarrage d'une partie, d'un replay ou d'une démo, messages du Worker de
// simulation (données prêtes, images, accusés, réponses), requêtes à la simulation.
//
// Méthodes de GameClient (client.ts) sorties en fonctions libres : le client est leur premier paramètre, `c`
// (`gc` dans les fonctions qui ont déjà une variable `c`).
import { parseFrame, fogFromParams } from "@supreme/shared";
import type { GameData, GameStart } from "@supreme/shared";
import { GameScene } from "../render/scene.ts";
import { parseMapInfo } from "../render/terrain.ts";
import { ui, pushMessage } from "./state.svelte.ts";
import { sfx } from "../audio/sound.ts";
import type { GameClient } from "./client.ts";
import { loop } from "./clientView.ts";
import { handleEvents } from "./clientEvents.ts";
import { buildMinimapBase } from "./clientMinimap.ts";

// ---------- démarrage ----------
export async function begin(c: GameClient, start: GameStart, snap: { tick: number; data: Uint8Array } | null): Promise<void> {
  c.start = start;
  ui.me = start.you;
  ui.spectator = start.you < 0;
  ui.fog = fogFromParams(start.params);
  ui.names = start.names;
  ui.gameOver = null;
  ui.ended = false;
  ui.screen = "loading";
  c.selected.clear();
  c.autoSelect = !snap;
  c.worker?.terminate();
  c.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  c.worker.onmessage = (e) => c.onWorker(e.data);
  const wasmUrl = new URL("/sim.wasm", location.href).href;
  if (snap) c.worker.postMessage({ type: "snapshot", wasmUrl, tick: snap.tick, data: snap.data }, [snap.data.buffer]);
  else c.worker.postMessage({ type: "init", wasmUrl, params: start.params });
}

export async function loadReplay(c: GameClient, url: string): Promise<void> {
  const rep = await (await fetch(url)).json();
  ui.replay = true;
  ui.me = -1;
  ui.spectator = true;
  ui.names = rep.names;
  ui.fog = fogFromParams(rep.params ?? []);
  ui.stats = Array.isArray(rep.stats) ? rep.stats : [];
  ui.screen = "loading";
  c.start = { params: rep.params, names: rep.names, you: -1, startTick: 0 };
  c.worker?.terminate();
  c.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  c.worker.onmessage = (e) => c.onWorker(e.data);
  c.worker.postMessage({ type: "loadReplay", wasmUrl: new URL("/sim.wasm", location.href).href, replay: rep });
}

export function startDemo(c: GameClient): void {
  ui.replay = true;
  ui.me = -1;
  ui.spectator = true;
  ui.names = Array.from({ length: 8 }, (_, i) => `Armée ${i + 1}`);
  ui.screen = "loading";
  c.worker?.terminate();
  c.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  c.worker.onmessage = (e) => c.onWorker(e.data);
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
  // ?demo=ascenseurs : files de tapis qui changent de niveau par des ascenseurs (vu comme le joueur 0)
  // ?demo=chantiers : chantiers figés à tous les avancements, pour juger leurs barres de progression
  // ?demo=nomades : soute des Transhumants, chariots de convoi en navette, générateur et poteaux (joueur 0)
  if (scene === "logistique" || scene === "ascenseurs" || scene === "chantiers" || scene === "nomades") ui.me = 0;
  // ?demo=anciens : porte de transit traversée en boucle, anneaux de transport, droïdes roulants, réplicateurs
  // ?demo=ponte : base de la Souche dont les couveuses pondent en boucle ; on y joue le joueur 0
  // ?demo=apprivoisement : la Reine de la Souche charme un nid de mordeurs (joueur 0)
  // ?demo=essaim : nouveaux organes et organismes de la Souche, Reine enracinée, flaques d'acide (joueur 0)
  // ?demo=arche : Arche à tourelles et bouclier, Arche nue à équiper, modules aménagés des Transhumants (joueur 0)
  // ?demo=relais : chaîne de relais logistiques qui ravitaille un chantier et une usine éloignés (joueur 0)
  c.demoOrders = scene === "formation" || scene === "anciens" || scene === "ponte" || scene === "essaim" || scene === "apprivoisement" || scene === "nomades" || scene === "arche" || scene === "relais";
  if (c.demoOrders) ui.me = 0;
  c.worker.postMessage({ type: "demo", wasmUrl: new URL("/sim.wasm", location.href).href, water, scene });
}

export function setReplaySpeed(c: GameClient, s: number): void {
  ui.replaySpeed = s;
  c.worker?.postMessage({ type: "replay", speed: s });
}

/** Arrête un replay ou une démo au tick donné (vérifications automatiques : une image à un instant précis). */
export function stopReplayAt(c: GameClient, tick: number): void {
  c.worker?.postMessage({ type: "replayEnd", tick });
}

export async function onWorker(c: GameClient, m: { type: string; [k: string]: unknown }): Promise<void> {
  switch (m.type) {
    case "ready": {
      c.data = JSON.parse(m.data as string) as GameData;
      // sons de combat : calculés en tâche de fond dès que les armes sont connues
      sfx.warm(c.data.weapons);
      ui.data = c.data;
      c.map = parseMapInfo(m.mapInfo as Int32Array, m.heights as Uint8Array);
      c.maxGround = -1;
      if (!c.scene) {
        c.scene = new GameScene(c.canvasEl!);
        await c.scene.init(new URLSearchParams(location.search).has("webgl"));
        ui.backend = c.scene.backend;
        c.scene.iconDistance = c.iconDistance();
        c.scene.applySettings(ui.gfx);
      }
      c.scene.setWorld(c.map, c.data);
      const st = c.map.starts[Math.max(0, ui.me)] ?? [c.map.w / 2, c.map.h / 2];
      c.scene.target.set(st[0], 0, st[1] + 4);
      c.scene.distance = 55;
      buildMinimapBase(c);
      ui.screen = "game";
      if (!c.running) {
        c.running = true;
        requestAnimationFrame((t) => loop(c, t));
      }
      break;
    }
    case "frame": {
      const f = parseFrame(m.buf as Int32Array);
      const prevVis = c.frame?.vis;
      if (!f.vis && prevVis) {
        f.vis = prevVis;
        f.visW = c.frame!.visW;
      }
      if (f.vis !== prevVis && f.vis && c.scene?.terrain) c.scene.terrain.updateFog(f.vis);
      // simulation arrêtée (fin d'un replay, démo arrêtée à un tick) : la même image revient, pour suivre la
      // caméra ; ses événements ont déjà été joués, et l'interpolation ne repart pas
      const again = c.frame !== null && f.tick === c.frame.tick;
      if (!again) handleEvents(c, f);
      c.frame = f;
      if (!again) c.frameTime = performance.now();
      c.lastTick = f.tick;
      if (c.autoSelect && ui.me >= 0 && f.players[ui.me]) {
        c.autoSelect = false;
        c.selected = new Set([f.players[ui.me].commander]);
        c.updateUi();
      }
      break;
    }
    case "ack":
      c.send({ t: "ack", tick: m.tick, hash: m.hash });
      break;
    case "query":
      c.pending.get(m.reqId as number)?.(m.result);
      c.pending.delete(m.reqId as number);
      break;
    case "error":
      pushMessage(String(m.message), "alert");
      break;
  }
}

export function query<T>(c: GameClient, q: string, a: number[]): Promise<T> {
  const id = ++c.reqId;
  return new Promise((res) => {
    c.pending.set(id, res as (r: unknown) => void);
    c.worker?.postMessage({ type: "query", reqId: id, q, a });
  });
}
