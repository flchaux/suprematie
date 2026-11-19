// Worker de simulation : applique les ordres de chaque tick, avance la simulation, calcule le hash
// et transmet le tampon de rendu au thread principal sans copie. Le thread principal ne simule rien.
import { Sim, HASH_EVERY } from "@supreme/shared";

type In =
  | { type: "init"; wasmUrl: string; params: number[] }
  | { type: "snapshot"; wasmUrl: string; tick: number; data: Uint8Array }
  | { type: "tick"; tick: number; orders: number[] }
  | { type: "view"; x0: number; y0: number; x1: number; y1: number; detail: number; player: number }
  | { type: "query"; reqId: number; q: "building" | "unit" | "canPlace" | "buildingAt" | "canPlaceMany" | "wreckAt" | "orders" | "planned" | "researchQueue" | "powerZones"; a: number[] }
  | { type: "replay"; speed: number }
  | { type: "pause"; paused: boolean };

let sim: Sim | null = null;
let wasmBytes: ArrayBuffer | null = null;
const queue: { tick: number; orders: number[] }[] = [];
let nextTick = 0;
let view = { x0: 0, y0: 0, x1: 64, y1: 64, detail: 2, player: -1 };
let replayOrders: Map<number, number[]> | null = null;
let replaySpeed = 1;
let replayEnd = 0;
let paused = false;

async function loadSim(url: string): Promise<Sim> {
  if (!wasmBytes) wasmBytes = await (await fetch(url)).arrayBuffer();
  return Sim.load(wasmBytes);
}

function sendStatic(): void {
  if (!sim) return;
  const heights = sim.mapHeights();
  const info = sim.mapInfo();
  postMessage({ type: "ready", data: sim.dataJson(), mapInfo: info, heights, tick: sim.tick() }, { transfer: [heights.buffer, info.buffer] });
}

function sendFrame(withVis: boolean): void {
  if (!sim) return;
  const buf = sim.render(view.x0, view.y0, view.x1, view.y1, view.detail, view.player, withVis);
  postMessage({ type: "frame", buf, tick: sim.tick() }, { transfer: [buf.buffer] });
}

function runTick(orders: number[]): void {
  if (!sim) return;
  const t = sim.tick();
  const h = sim.step(orders);
  if (t % HASH_EVERY === 0) postMessage({ type: "ack", tick: t, hash: h });
  else if (t % 5 === 0) postMessage({ type: "ack", tick: t });
}

function pump(): void {
  if (!sim) return;
  if (replayOrders) {
    if (paused) return;
    const n = replaySpeed;
    for (let i = 0; i < n && sim.tick() < replayEnd; i++) runTick(replayOrders.get(sim.tick()) ?? []);
    sendFrame(sim.tick() % 10 === 0 || n > 1);
    return;
  }
  let ran = 0;
  // rattrapage : plusieurs ticks d'un coup si on a du retard (au plus 40 par passage)
  while (queue.length && queue[0].tick <= nextTick) {
    const q = queue.shift()!;
    if (q.tick < nextTick) continue;
    runTick(q.orders);
    nextTick++;
    ran++;
    if (queue.length <= 2 || ran >= 40) break;
  }
  if (ran) sendFrame(sim.tick() % 10 === 0 || ran > 1);
}

setInterval(pump, 50);

onmessage = async (e: MessageEvent<In>) => {
  const m = e.data;
  switch (m.type) {
    case "init":
      sim = await loadSim(m.wasmUrl);
      sim.init(m.params);
      nextTick = 0;
      sendStatic();
      sendFrame(true);
      break;
    case "snapshot":
      sim = await loadSim(m.wasmUrl);
      if (!sim.restore(m.data)) postMessage({ type: "error", message: "restauration impossible" });
      nextTick = sim.tick();
      while (queue.length && queue[0].tick < nextTick) queue.shift();
      sendStatic();
      sendFrame(true);
      break;
    case "tick":
      queue.push({ tick: m.tick, orders: m.orders });
      if (queue.length <= 3) pump();
      break;
    case "view":
      view = m;
      break;
    case "query": {
      if (!sim) return;
      let result: unknown = null;
      if (m.q === "building") result = sim.infoBuilding(m.a[0]);
      else if (m.q === "unit") result = sim.infoUnit(m.a[0]);
      else if (m.q === "canPlace") result = m.a.length >= 5 ? sim.canPlace(m.a[0], m.a[1], m.a[2], m.a[3], m.a[4]) : false;
      else if (m.q === "buildingAt") result = sim.buildingAt(m.a[0], m.a[1]);
      else if (m.q === "wreckAt") result = sim.wreckAt(m.a[0], m.a[1]);
      else if (m.q === "orders") result = sim.unitOrders(m.a);
      else if (m.q === "planned") result = sim.plannedBuilds(m.a[0]);
      else if (m.q === "researchQueue") result = Array.from(sim.researchQueue(m.a[0]));
      else if (m.q === "powerZones") result = sim.powerZones(m.a[0]);
      else if (m.q === "canPlaceMany") {
        // a = [joueur, type, puis (x, y, dir)…]
        const r: boolean[] = [];
        for (let i = 2; i + 2 < m.a.length; i += 3) r.push(sim.canPlace(m.a[0], m.a[1], m.a[i], m.a[i + 1], m.a[i + 2]));
        result = r;
      }
      postMessage({ type: "query", reqId: m.reqId, result });
      break;
    }
    case "replay":
      replaySpeed = Math.max(0, Math.min(16, m.speed));
      break;
    case "pause":
      paused = m.paused;
      break;
  }
};

// Mode démo : partie de référence synthétique jouée localement (test du rendu à grande échelle)
addEventListener("message", async (e: MessageEvent) => {
  const m = e.data as { type: string; wasmUrl?: string; water?: boolean; scene?: string };
  if (m.type !== "demo" || !m.wasmUrl) return;
  sim = await loadSim(m.wasmUrl);
  sim.init([1, 1024, m.water ? 1 : 0, 8, 0, 0, 100, 100, 1, 0, 100, 100, 2, 0, 100, 100, 3, 0, 100, 100, 4, 0, 100, 100, 5, 0, 100, 100, 6, 0, 100, 100, 7, 0, 100, 100]);
  // la partie de référence (armées, usines) est sur carte sèche ; avec ?demo=eau on garde la carte seule
  if (m.scene === "logistique") sim.logisticsDemo();
  else if (m.scene === "armes") sim.weaponsDemo();
  else if (!m.water) sim.benchReference();
  replayOrders = new Map();
  replayEnd = 1 << 30;
  sendStatic();
  sendFrame(true);
});

// Mode replay : chargé par un message dédié
addEventListener("message", async (e: MessageEvent) => {
  const m = e.data as { type: string; wasmUrl?: string; replay?: { params: number[]; ticks: number; orders: [number, number[]][] } };
  if (m.type !== "loadReplay" || !m.replay || !m.wasmUrl) return;
  sim = await loadSim(m.wasmUrl);
  sim.init(m.replay.params);
  replayOrders = new Map(m.replay.orders);
  replayEnd = m.replay.ticks;
  sendStatic();
  sendFrame(true);
});
