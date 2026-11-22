// Lecture du tampon de rendu produit par la simulation (voir sim/src/render.rs).
import { NATURE_TEAM } from "./data.ts";

export const HEADER = 16;
export const NUM_ITEMS = 31;
/** ... + plafond de la réserve (dernier mot) */
export const PLAYER_WORDS = 13 + 4 * NUM_ITEMS + 9;
export const UNIT_WORDS = 9;
export const BUILDING_WORDS = 8;
export const ITEM_WORDS = 3;
export const PROJ_WORDS = 6;
export const EVENT_WORDS = 5;
export const WRECK_WORDS = 4;
export const SHIELD_WORDS = 4;
export const CARRIER_WORDS = 5;

export const EV = {
  BEAM: 2, EXPLOSION: 3, UNIT_DIED: 4, BUILDING_DIED: 5, BUILT: 6, RESEARCH: 7, NUKE: 8, ELIMINATED: 9,
  UNIT_CREATED: 10, SHIELD_HIT: 11, TELEPORT: 12, FIRE: 13, INTERCEPT: 14, ORBITAL: 15, GAME_OVER: 16, PROMOTED: 17, GIFT: 18, ATTACKED: 19, FACTORY_STARVED: 20, FUEL_LOW: 41, FUEL_DRY: 42, SHARDS: 43, EPPZ: 44, DEPLOY_FAILED: 45, TAMED: 46,
} as const;

export const UF = { FIRING: 1, WORKING: 2, CHARGING: 4, STUNNED: 8, DEPLOYED: 16, SHIELD: 32, IDLE: 64, CARGO: 128 } as const;
export const BF = { WORKING: 1, UNPOWERED: 2, STALLED: 4, ENABLED: 8, STUNNED: 16, NO_INPUT: 32, OUT_BLOCKED: 64, LOW_POWER: 128 } as const;

export interface PlayerView {
  alive: boolean; team: number; researchedLo: number; researchedHi: number; research: number; researchProgress: number;
  powerProd: number; powerUse: number; unitCount: number; commander: number; kills: number; losses: number; bot: boolean;
  stock: Int32Array; produced: Int32Array; consumed: Int32Array;
  /** stock commun de l'équipe (entrepôts d'équipe) */
  teamStock: Int32Array;
  /** plafond de la réserve, par objet (base + dépôts) */
  stockCap: number;
  /** fragments d'énergie en réserve (surcadençage) */
  shards: number;
  /** EPPZ en réserve (capturés dans les ruines des Anciens) */
  eppz: number;
  /** race (voir data.races) */
  race: number;
  /** recherches 64 à 127 */
  researched2Lo: number;
  researched2Hi: number;
  /** Souche : réserve totale de ses réseaux de racines (sève, sels) et plafond total */
  seve: number;
  sels: number;
  store: number;
}

export interface Frame {
  buf: Int32Array;
  tick: number;
  players: PlayerView[];
  nUnits: number; unitOff: number;
  nBuildings: number; buildingOff: number;
  nItems: number; itemOff: number;
  nProj: number; projOff: number;
  nEvents: number; eventOff: number;
  nWrecks: number; wreckOff: number;
  nShields: number; shieldOff: number;
  /** trains et drones de fret : index, x, y, type | joueur << 8 | en route << 16 | chargé << 17, angle */
  nCarriers: number; carrierOff: number;
  buildingsVersion: number;
  winner: number;
  vis: Uint8Array | null;
  visW: number;
}

/** Le joueur `i` est-il la faune (joueur caché) ? */
export function isFauna(players: { team: number }[], i: number): boolean {
  return players[i]?.team === NATURE_TEAM;
}

/** Nombre de vrais joueurs (la faune, s'il y en a une, est toujours la dernière). */
export function realPlayers<T extends { team: number }>(players: T[]): T[] {
  return players.filter((p) => p.team !== NATURE_TEAM);
}

export function hasTech(p: PlayerView, t: number): boolean {
  if (t === 0) return true;
  const w = t < 32 ? p.researchedLo : t < 64 ? p.researchedHi : t < 96 ? p.researched2Lo : p.researched2Hi;
  return ((w >>> (t % 32)) & 1) === 1;
}

export function parseFrame(buf: Int32Array): Frame {
  const np = buf[2];
  let o = HEADER;
  const players: PlayerView[] = [];
  for (let i = 0; i < np; i++) {
    players.push({
      alive: buf[o] !== 0, team: buf[o + 1], researchedLo: buf[o + 2], researchedHi: buf[o + 3], research: buf[o + 4],
      researchProgress: buf[o + 5], powerProd: buf[o + 6], powerUse: buf[o + 7], unitCount: buf[o + 8], commander: buf[o + 9] >>> 0,
      kills: buf[o + 10], losses: buf[o + 11], bot: buf[o + 12] !== 0,
      stock: buf.subarray(o + 13, o + 13 + NUM_ITEMS),
      produced: buf.subarray(o + 13 + NUM_ITEMS, o + 13 + 2 * NUM_ITEMS),
      consumed: buf.subarray(o + 13 + 2 * NUM_ITEMS, o + 13 + 3 * NUM_ITEMS),
      teamStock: buf.subarray(o + 13 + 3 * NUM_ITEMS, o + 13 + 4 * NUM_ITEMS),
      stockCap: buf[o + 13 + 4 * NUM_ITEMS],
      shards: buf[o + 14 + 4 * NUM_ITEMS],
      eppz: buf[o + 15 + 4 * NUM_ITEMS],
      race: buf[o + 16 + 4 * NUM_ITEMS],
      researched2Lo: buf[o + 17 + 4 * NUM_ITEMS],
      researched2Hi: buf[o + 18 + 4 * NUM_ITEMS],
      seve: buf[o + 19 + 4 * NUM_ITEMS],
      sels: buf[o + 20 + 4 * NUM_ITEMS],
      store: buf[o + 21 + 4 * NUM_ITEMS],
    });
    o += PLAYER_WORDS;
  }
  const f: Frame = {
    buf, tick: buf[1], players,
    nUnits: buf[3], unitOff: o,
    nBuildings: buf[4], buildingOff: 0,
    nItems: buf[5], itemOff: 0,
    nProj: buf[6], projOff: 0,
    nEvents: buf[7], eventOff: 0,
    nWrecks: buf[8], wreckOff: 0,
    nShields: buf[13], shieldOff: 0,
    nCarriers: buf[14], carrierOff: 0,
    buildingsVersion: buf[9], winner: buf[10], vis: null, visW: buf[12],
  };
  o += f.nUnits * UNIT_WORDS;
  f.buildingOff = o;
  o += f.nBuildings * BUILDING_WORDS;
  f.itemOff = o;
  o += f.nItems * ITEM_WORDS;
  f.projOff = o;
  o += f.nProj * PROJ_WORDS;
  f.eventOff = o;
  o += f.nEvents * EVENT_WORDS;
  f.wreckOff = o;
  o += f.nWrecks * WRECK_WORDS;
  f.shieldOff = o;
  o += f.nShields * SHIELD_WORDS;
  f.carrierOff = o;
  o += f.nCarriers * CARRIER_WORDS;
  if (buf[11]) {
    f.vis = new Uint8Array(buf.buffer, buf.byteOffset + o * 4, f.visW * f.visW);
  }
  return f;
}

export interface BotUnit { id: number; kind: number; owner: number; x: number; y: number; hp: number; order: number; nOrders: number; carried: boolean; cargo: number }
export interface BotBuilding { ref: number; kind: number; owner: number; dir: number; x: number; y: number; hp: number; build: number; working: boolean; stalled: boolean; unpowered: boolean; ammo: number; charged: boolean; queue: number; recipe: number; /** niveau d'amélioration */ level: number; /** amélioration en cours */ upgrading: boolean }
export interface BotWreck { ref: number; x: number; y: number; value: number }
export interface BotView { tick: number; players: PlayerView[]; units: BotUnit[]; buildings: BotBuilding[]; wrecks: BotWreck[]; winner: number }

export function parseBotDump(buf: Int32Array): BotView {
  const np = buf[1];
  let o = 8;
  const players: PlayerView[] = [];
  for (let i = 0; i < np; i++) {
    players.push({
      alive: buf[o] !== 0, team: buf[o + 1], researchedLo: buf[o + 2], researchedHi: buf[o + 3], research: buf[o + 4],
      researchProgress: buf[o + 5], powerProd: buf[o + 6], powerUse: buf[o + 7], unitCount: buf[o + 8], commander: buf[o + 9] >>> 0,
      kills: buf[o + 10], losses: buf[o + 11], bot: buf[o + 12] !== 0,
      stock: buf.subarray(o + 13, o + 13 + NUM_ITEMS),
      produced: buf.subarray(o + 13 + NUM_ITEMS, o + 13 + 2 * NUM_ITEMS),
      consumed: buf.subarray(o + 13 + 2 * NUM_ITEMS, o + 13 + 3 * NUM_ITEMS),
      teamStock: buf.subarray(o + 13 + 3 * NUM_ITEMS, o + 13 + 4 * NUM_ITEMS),
      stockCap: buf[o + 13 + 4 * NUM_ITEMS],
      shards: buf[o + 14 + 4 * NUM_ITEMS],
      eppz: buf[o + 15 + 4 * NUM_ITEMS],
      race: buf[o + 16 + 4 * NUM_ITEMS],
      researched2Lo: buf[o + 17 + 4 * NUM_ITEMS],
      researched2Hi: buf[o + 18 + 4 * NUM_ITEMS],
      seve: buf[o + 19 + 4 * NUM_ITEMS],
      sels: buf[o + 20 + 4 * NUM_ITEMS],
      store: buf[o + 21 + 4 * NUM_ITEMS],
    });
    o += PLAYER_WORDS;
  }
  const units: BotUnit[] = [];
  for (let i = 0; i < buf[2]; i++, o += 8) {
    units.push({ id: buf[o] >>> 0, kind: buf[o + 1] & 0xff, owner: (buf[o + 1] >> 8) & 0xff, x: buf[o + 2], y: buf[o + 3], hp: buf[o + 4], order: buf[o + 5], nOrders: buf[o + 6], carried: (buf[o + 7] & 1) !== 0, cargo: buf[o + 7] >> 8 });
  }
  const buildings: BotBuilding[] = [];
  for (let i = 0; i < buf[3]; i++, o += 8) {
    const f = buf[o + 6];
    buildings.push({
      ref: buf[o] >>> 0, kind: buf[o + 1] & 0xff, owner: (buf[o + 1] >> 8) & 0xff, dir: (buf[o + 1] >> 16) & 3, x: buf[o + 2], y: buf[o + 3],
      hp: buf[o + 4], build: buf[o + 5], working: (f & 1) !== 0, stalled: (f & 2) !== 0, unpowered: (f & 4) !== 0, charged: (f & 8) !== 0, ammo: f >> 8,
      queue: buf[o + 7] & 0xffff, recipe: (buf[o + 7] >> 16) & 0xff, level: (buf[o + 7] >> 24) & 15, upgrading: ((buf[o + 7] >> 28) & 1) !== 0,
    });
  }
  const wrecks: BotWreck[] = [];
  for (let i = 0; i < buf[4]; i++, o += 4) wrecks.push({ ref: buf[o] >>> 0, x: buf[o + 1], y: buf[o + 2], value: buf[o + 3] });
  return { tick: buf[0], players, units, buildings, wrecks, winner: buf[5] };
}
