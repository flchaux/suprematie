// Renseignement, inspiré des cartes de menace (IMAP) de l'IA du mod LOUD : la carte est découpée en
// cases de 16x16 ; pour chaque joueur, on additionne dans chaque case la « puissance » de ses forces
// par catégorie. L'IA s'en sert pour juger un combat avant de l'engager, choisir des cibles peu
// défendues, et adapter sa production (rapports de force terre / air / antiaérien).
//
// Puissance d'une unité : racine de (points de vie x dégâts par seconde). Pour deux groupes qui se
// battent, le rapport des sommes de ces puissances donne une bonne idée de l'issue (loi de Lanchester).
import type { BotView, GameData } from "@supreme/shared";
import { Layer, BUILD_FULL } from "@supreme/shared";
import { TILE } from "./util.ts";

export const CELL = 16; // cases par cellule de renseignement
const TICKS_PER_S = 20;
const M_GROUND = 1 | 2; // terre et mer
const M_AIR = 8;

/** Catégories des cartes de menace. */
export const T = {
  /** forces capables de frapper au sol (unités et tourelles) */
  Surface: 0,
  /** défense antiaérienne (unités et tourelles) */
  AntiAir: 1,
  /** aviation (toute unité aérienne armée) */
  Air: 2,
  /** valeur économique des bâtiments (coût) */
  Eco: 3,
} as const;
export type T = (typeof T)[keyof typeof T];
const NL = 4;

interface KindPower {
  ground: number; // puissance contre le sol
  aa: number; // puissance antiaérienne
  air: boolean;
}

const kindCache = new WeakMap<GameData, { units: KindPower[]; buildings: KindPower[]; value: number[] }>();

function dps(w: { dmg: number; cooldown: number; salvo: number }): number {
  return (w.dmg * Math.max(1, w.salvo) * TICKS_PER_S) / Math.max(1, w.cooldown);
}

/** Puissance de chaque type d'unité et de bâtiment (calculée une fois par jeu de données). */
export function kindPowers(data: GameData): { units: KindPower[]; buildings: KindPower[]; value: number[] } {
  let k = kindCache.get(data);
  if (k) return k;
  const units = data.units.map((u) => {
    let g = 0;
    let a = 0;
    for (const wi of u.weapons) {
      const w = data.weapons[wi];
      if (!w) continue;
      if (w.mask & M_GROUND) g += dps(w);
      if (w.mask & M_AIR) a += dps(w);
    }
    return { ground: Math.sqrt(u.hp * g), aa: Math.sqrt(u.hp * a), air: u.layer === Layer.Air };
  });
  const buildings = data.buildings.map((b) => {
    const w = b.weapon >= 0 ? data.weapons[b.weapon] : null;
    const d = w ? dps(w) : 0;
    return { ground: w && w.mask & M_GROUND ? Math.sqrt(b.hp * d) : 0, aa: w && w.mask & M_AIR ? Math.sqrt(b.hp * d) : 0, air: false };
  });
  // valeur économique : coût total ; les tapis, bras, pylônes et murs ne comptent presque pas
  const value = data.buildings.map((b) => {
    const c = b.cost.reduce((s, [, n]) => s + n, 0);
    return b.cls === 1 || b.cls === 2 || b.cls === 7 || b.cls === 10 ? 0 : c;
  });
  k = { units, buildings, value };
  kindCache.set(data, k);
  return k;
}

/** Cartes de menace de tous les joueurs pour une vue (partagées par tous les bots). */
export class Intel {
  cw: number;
  ch: number;
  /** layers[joueur][catégorie][cellule] */
  layers: Float32Array[][];
  /** totaux par joueur : puissance terrestre (hors aviation), aviation, antiaérien (unités seules), valeur */
  land: number[];
  air: number[];
  airToAir: number[];
  aaUnits: number[];
  aaTurrets: number[];
  eco: number[];

  constructor(view: BotView, data: GameData, mapW: number, mapH: number) {
    const np = view.players.length;
    this.cw = Math.ceil(mapW / CELL);
    this.ch = Math.ceil(mapH / CELL);
    const n = this.cw * this.ch;
    this.layers = [];
    for (let p = 0; p < np; p++) {
      const l: Float32Array[] = [];
      for (let k = 0; k < NL; k++) l.push(new Float32Array(n));
      this.layers.push(l);
    }
    this.land = new Array(np).fill(0);
    this.air = new Array(np).fill(0);
    this.airToAir = new Array(np).fill(0);
    this.aaUnits = new Array(np).fill(0);
    this.aaTurrets = new Array(np).fill(0);
    this.eco = new Array(np).fill(0);
    const kp = kindPowers(data);
    // unités de commandement de toutes les races (robot, Reine, Arche) : hors de l'armée de terre
    const cmd = data.units.map((u) => !!u.commander);
    for (const u of view.units) {
      if (u.carried || u.owner >= np) continue;
      const k = kp.units[u.kind];
      if (!k || (k.ground === 0 && k.aa === 0)) continue;
      // les points de vie restants comptent : une unité blessée pèse moins
      const hpf = Math.sqrt(Math.max(0.05, Math.min(1, u.hp / Math.max(1, data.units[u.kind].hp))));
      const c = this.cell(u.x, u.y);
      const L = this.layers[u.owner];
      const g = k.ground * hpf;
      const a = k.aa * hpf;
      if (k.air) {
        L[T.Air][c] += Math.max(g, a);
        this.air[u.owner] += g;
        this.airToAir[u.owner] += a;
      } else {
        L[T.Surface][c] += g;
        if (!cmd[u.kind]) this.land[u.owner] += g;
        this.aaUnits[u.owner] += a;
      }
      L[T.AntiAir][c] += a;
    }
    for (const b of view.buildings) {
      if (b.owner >= np || b.build < BUILD_FULL) continue;
      const k = kp.buildings[b.kind];
      const L = this.layers[b.owner];
      const c = this.cell(b.x * TILE, b.y * TILE);
      if (k.ground) L[T.Surface][c] += k.ground;
      if (k.aa) {
        L[T.AntiAir][c] += k.aa;
        this.aaTurrets[b.owner] += k.aa;
      }
      const v = kp.value[b.kind];
      if (v) {
        L[T.Eco][c] += v;
        this.eco[b.owner] += v;
      }
    }
  }

  cell(x: number, y: number): number {
    const cx = Math.max(0, Math.min(this.cw - 1, Math.floor(x / TILE / CELL)));
    const cy = Math.max(0, Math.min(this.ch - 1, Math.floor(y / TILE / CELL)));
    return cy * this.cw + cx;
  }

  /** Somme d'une catégorie pour les joueurs `who` dans un rayon (en cases) autour de (x, y) en sous-unités. */
  sum(who: number[], layer: T, x: number, y: number, rTiles: number): number {
    const r = Math.max(0, Math.ceil(rTiles / CELL - 0.5));
    const cx = Math.floor(x / TILE / CELL);
    const cy = Math.floor(y / TILE / CELL);
    let s = 0;
    for (let j = Math.max(0, cy - r); j <= Math.min(this.ch - 1, cy + r); j++) {
      for (let i = Math.max(0, cx - r); i <= Math.min(this.cw - 1, cx + r); i++) {
        const c = j * this.cw + i;
        for (const p of who) s += this.layers[p][layer][c];
      }
    }
    return s;
  }
}

const intelCache = new WeakMap<BotView, Intel>();
/** Renseignement de la vue courante (calculé une fois par décision, partagé par tous les bots). */
export function intelOf(view: BotView, data: GameData, mapW: number, mapH: number): Intel {
  let i = intelCache.get(view);
  if (!i) {
    i = new Intel(view, data, mapW, mapH);
    intelCache.set(view, i);
  }
  return i;
}

/** Tableau de bord partagé par les IA d'une même équipe (cible commune, appels à l'aide). */
export interface TeamBoard {
  target: number;
  targetSince: number;
  /** appels à l'aide : position, puissance ennemie, tick, joueur */
  distress: { x: number; y: number; power: number; tick: number; player: number; air: boolean; vip: boolean }[];
}
const boards = new WeakMap<object, Map<number, TeamBoard>>();
export function teamBoard(game: object, team: number): TeamBoard {
  let m = boards.get(game);
  if (!m) boards.set(game, (m = new Map()));
  let b = m.get(team);
  if (!b) m.set(team, (b = { target: -1, targetSince: -1e9, distress: [] }));
  return b;
}
