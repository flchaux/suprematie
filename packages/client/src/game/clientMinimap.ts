// Contrôleur de partie, minicarte : clics (caméra, ordre de déplacement, ping, navette), fond de carte, dessin.
//
// Méthodes de GameClient (client.ts) sorties en fonctions libres : le client est leur premier paramètre, `c`
// (`gc` dans les fonctions qui ont déjà une variable `c`).
import * as THREE from "three/webgpu";
import * as Ord from "@supreme/shared/orders.ts";
import { UNIT_WORDS, BUILDING_WORDS } from "@supreme/shared";
import { DEAD_COLOR } from "../render/power.ts";
import { DEPOSIT_COLORS } from "../render/terrain.ts";
import { ownerHex } from "./colors.ts";
import { ui } from "./state.svelte.ts";
import { sfx } from "../audio/sound.ts";
import { PING_TIME } from "../render/pings.ts";
import type { GameClient } from "./client.ts";
import { TILE } from "./clientConsts.ts";

// ---------- minicarte ----------
export function attachMinimap(gc: GameClient, c: HTMLCanvasElement): void {
  if (gc.minimap === c) return;
  gc.minimap = c;
  const go = (e: PointerEvent) => {
    if (!gc.map || !gc.scene) return;
    const r = c.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * gc.map.w;
    const z = ((e.clientY - r.top) / r.height) * gc.map.h;
    if (e.button === 0 && e.type === "pointerdown" && (ui.mode === "ping" || ui.mode === "ferryFrom" || ui.mode === "ferryTo" || (e.altKey && !ui.mode))) {
      if (ui.mode.startsWith("ferry")) gc.ferryClick(x, z, e.shiftKey);
      else {
        gc.sendPing(x, z);
        if (ui.mode === "ping" && !e.shiftKey) gc.cancelMode();
      }
      return true;
    }
    if (e.button === 2) {
      const units = gc.selectedUnits();
      if (units.length) {
        if (e.shiftKey && units.length > 1) gc.cmd(Ord.moveQueuedFormation(units.map((u) => u.id), x * TILE, z * TILE));
        else gc.cmd(Ord.move(units, x * TILE, z * TILE, e.shiftKey));
        sfx.confirm();
      }
      return;
    }
    gc.scene.target.x = x;
    gc.scene.target.z = z;
  };
  c.addEventListener("pointerdown", (e) => {
    // ping ou navette : le clic ne déplace pas la caméra
    if (go(e)) return;
    const move = (ev: PointerEvent) => ev.buttons & 1 && go(ev);
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  });
  c.addEventListener("contextmenu", (e) => e.preventDefault());
  buildMinimapBase(gc);
}

export function buildMinimapBase(gc: GameClient): void {
  const c = gc.minimap;
  const m = gc.map;
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
  gc.minimapBase = img;
}

export function drawMinimap(gc: GameClient): void {
  const c = gc.minimap;
  const m = gc.map;
  const f = gc.frame;
  if (!c || !m || !f || !gc.minimapBase) return;
  const ctx = c.getContext("2d")!;
  ctx.putImageData(gc.minimapBase, 0, 0);
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
  const zones = gc.zones;
  const hex = (c: number) => "#" + c.toString(16).padStart(6, "0");
  if (zones && gc.scene?.power) {
    const colors = gc.scene.power.colorOf;
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
    const def = gc.data!.buildings[kind];
    const x = f.buf[o + 2] & 0xffff;
    const z = (f.buf[o + 2] >>> 16) & 0xffff;
    if (gc.teamOf(owner) !== myTeam && !seen(x, z, 9)) continue;
    ctx.fillStyle = ownerHex(owner, f.players);
    ctx.fillRect(x * k, z * k, Math.max(1.5, def.w * k), Math.max(1.5, def.h * k));
  }
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += UNIT_WORDS) {
    const owner = (f.buf[o + 1] >> 8) & 0xff;
    const x = f.buf[o + 2] / TILE;
    const z = f.buf[o + 3] / TILE;
    const enemy = gc.teamOf(owner) !== myTeam;
    if (enemy && !seen(x, z, 3)) continue;
    const kind = f.buf[o + 1] & 0xff;
    const big = gc.data!.units[kind].tier === 6 || kind === 0;
    ctx.fillStyle = gc.selected.has(f.buf[o] >>> 0) ? "#ffffff" : ownerHex(owner, f.players);
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
  // pings : point et ondes à la couleur du joueur
  for (const p of gc.scene?.pings?.list ?? []) {
    ctx.strokeStyle = ctx.fillStyle = "#" + p.color.toString(16).padStart(6, "0");
    ctx.globalAlpha = Math.min(1, (PING_TIME - p.age) / 1.2);
    ctx.beginPath();
    ctx.arc(p.x * k, p.z * k, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    for (const w of [0, 0.5]) {
      ctx.beginPath();
      ctx.arc(p.x * k, p.z * k, 3 + ((p.age * 0.7 + w) % 1) * 14, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // cadre de la caméra
  const r = gc.scene!.viewRect();
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 1;
  ctx.strokeRect(r[0] * k, r[1] * k, (r[2] - r[0]) * k, (r[3] - r[1]) * k);
}
