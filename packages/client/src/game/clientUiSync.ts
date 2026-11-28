// Contrôleur de partie, état pour l'interface : mise à jour de `ui` d'après l'image (ressources, joueurs,
// sélection, fiches), requêtes périodiques (économie de la zone, disponible pour construire).
//
// Méthodes de GameClient (client.ts) sorties en fonctions libres : le client est leur premier paramètre, `c`
// (`gc` dans les fonctions qui ont déjà une variable `c`).
import * as Ord from "@supreme/shared/orders.ts";
import { UNIT_WORDS, BUILDING_WORDS, BF, SEVE, SELS, pausableClass, realPlayers } from "@supreme/shared";
import type { ModInfo, ZoneEconomy } from "@supreme/shared";
import type { GameScene } from "../render/scene.ts";
import { DEAD_COLOR } from "../render/power.ts";
import { ui, type HarvestInfo, type PickupInfo, type DeliverInfo } from "./state.svelte.ts";
import { kb } from "./keys.svelte.ts";
import type { GameClient } from "./client.ts";
import { TILE } from "./clientConsts.ts";
import { prodOf } from "../render/siteBars.ts";
import { setMusicRace } from "../audio/music.ts";

/** Barre des ressources : économie de la zone électrique au centre de l'écran (4 fois par seconde au plus,
 * une requête à la fois). */
export function queryZone(c: GameClient, sc: GameScene): void {
  // une requête à la fois (sans réponse au bout de 2 s, le Worker n'avait pas encore de partie : on relance)
  const now = performance.now();
  if (now - c.zoneSent < 2000 || !c.frame || ui.me < 0 || ui.spectator) return;
  c.zoneSent = now;
  const me = ui.me;
  const at: [number, number] = [Math.floor(sc.target.x), Math.floor(sc.target.z)];
  void c.query<ZoneEconomy | null>("zoneEconomy", [me, ...at]).then((z) => {
    c.zoneSent = 0;
    if (!z || ui.me !== me) return;
    const color = z.zone === 2 ? DEAD_COLOR : (sc.power?.colorOf.get(z.net ?? 0) ?? 0x8a96a8);
    ui.zone = { ...z, color, at };
  });
}

/**
 * Disponible pour payer une construction en un lieu (voir sim render::reach_stock) : stocks à moins de
 * `r` cases de la case (x, y), réseau des relais qui la couvrent, soutes des constructeurs `ids`.
 */
export async function reachStock(c: GameClient, x: number, y: number, r: number, ids: number[]): Promise<number[] | null> {
  const key = `${x},${y},${r},${ids.join(",")}`;
  const now = performance.now();
  // même lieu interrogé il y a moins de 250 ms : réponse connue
  if (key === c.reachKey && now - c.reachAt < 250 && ui.buildReach) return ui.buildReach;
  c.reachKey = key;
  c.reachAt = now;
  return (await c.query<number[] | null>("reachStock", [ui.me, x, y, r, ...ids])) ?? null;
}
/** Hors de la pose : disponible autour du premier constructeur choisi (son rayon de ravitaillement), sinon
 * autour du centre de l'écran (rayon des paiements immédiats). Une requête à la fois. */
export function queryBuildReach(c: GameClient, sc: GameScene): void {
  const now = performance.now();
  if (now - c.reachSent < 2000 || !c.frame || !c.data || ui.me < 0 || ui.spectator) return;
  c.reachSent = now;
  const me = ui.me;
  const b = c.selectedUnits().find((u) => c.data!.units[u.kind].buildPower > 0);
  const near = c.data.depot?.near ?? 30;
  const at = b ? { x: Math.floor(b.x / TILE), y: Math.floor(b.y / TILE), r: Math.max(near, c.data.units[b.kind].supply), ids: c.engineers() } : { x: Math.floor(sc.target.x), y: Math.floor(sc.target.z), r: near, ids: [] };
  void reachStock(c, at.x, at.y, at.r, at.ids).then((v) => {
    c.reachSent = 0;
    if (!v || ui.me !== me || (ui.mode === "build" && c.ghostCells.length)) return;
    ui.buildReach = v;
    ui.buildReachAt = b ? "builder" : "view";
  });
}

// ---------- état pour l'interface ----------
export function updateUi(c: GameClient): void {
  const f = c.frame;
  if (!f || !c.data) return;
  ui.tick = f.tick;
  const me = f.players[Math.max(0, ui.me)];
  if (me && ui.me >= 0) {
    ui.stock = Array.from(me.stock);
    // Souche : sève et sels sont dans les réseaux de racines (réserve totale), pas dans le stock
    if (me.race === 1) {
      ui.stock[SEVE] = me.seve;
      ui.stock[SELS] = me.sels;
    }
    ui.teamStock = Array.from(me.teamStock);
    ui.stockCap = me.stockCap;
    ui.shards = me.shards ?? 0;
    ui.eppz = me.eppz ?? 0;
    ui.produced = Array.from(me.produced);
    ui.consumed = Array.from(me.consumed);
    ui.powerProd = me.powerProd;
    ui.powerUse = me.powerUse;
    ui.unitCount = me.unitCount;
    ui.research = me.research;
    ui.researchProgress = me.researchProgress;
    ui.researchedLo = me.researchedLo;
    ui.researchedHi = me.researchedHi;
    ui.researched2Lo = me.researched2Lo;
    ui.researched2Hi = me.researched2Hi;
    ui.race = me.race;
    setMusicRace(me.race);
    ui.seve = me.seve;
    ui.sels = me.sels;
    ui.store = me.store;
  }
  // la faune (joueur caché, le dernier) n'apparaît pas parmi les joueurs
  ui.players = realPlayers(f.players).map((p, i) => ({ name: ui.names[i] ?? `Joueur ${i + 1}`, alive: p.alive, team: p.team, units: p.unitCount, kills: p.kills, losses: p.losses, bot: p.bot, power: p.powerProd }));
  // sélection : retirer les morts, regrouper par type
  const groups = new Map<number, number[]>();
  const lvls = new Map<number, number>();
  const alive = new Set<number>();
  let foreign = -1;
  c.selOwn.clear();
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += UNIT_WORDS) {
    const id = f.buf[o] >>> 0;
    if (!c.selected.has(id)) continue;
    alive.add(id);
    const own = (f.buf[o + 1] >> 8) & 0xff;
    if (own === ui.me) c.selOwn.add(id);
    else foreign = own;
    const k = f.buf[o + 1] & 0xff;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(id);
    lvls.set(k, Math.max(lvls.get(k) ?? 0, (f.buf[o + 1] >>> 24) & 7));
  }
  // bâtiments sélectionnés : un seul passage sur l'image quand il y en a beaucoup
  const selBs: { ref: number; kind: number; owner: number; paused: boolean; built: boolean; prod: number }[] = [];
  let nb = 0;
  for (const id of c.selected) if (Ord.isBuildingRef(id)) nb++;
  const byRef = nb > 4 ? new Map<number, { ref: number; kind: number; owner: number; paused: boolean; built: boolean; prod: number }>() : null;
  if (byRef) {
    for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      const ref = f.buf[o] >>> 0;
      if (c.selected.has(ref)) byRef.set(ref, buildingState(c, f.buf, o));
    }
  }
  for (const id of c.selected) {
    if (Ord.isBuildingRef(id)) {
      const bw = byRef ? byRef.get(id) : findBuildingState(c, id);
      if (bw) {
        alive.add(id);
        selBs.push(bw);
      } else if (!c.frame || c.scene?.strategic) alive.add(id);
    }
  }
  const selB: typeof ui.selBuilding = selBs.length === 1 ? selBs[0] : null;
  for (const id of [...c.selected]) if (!alive.has(id)) c.selected.delete(id);
  ui.selUnits = [...groups.entries()].map(([kind, ids]) => ({ kind, count: ids.length, ids, lvl: lvls.get(kind) ?? 0 })).sort((a, b) => a.kind - b.kind);
  ui.selBuilding = selB;
  ui.selBuildings = selBs;
  // unités d'un autre joueur (sans aucune des nôtres) : fiche de statistiques seulement
  ui.selForeign = c.selOwn.size === 0 && ui.selUnits.length ? foreign : -1;
  if (c.selected.size) {
    ui.selDeposit = null;
    ui.selPlan = null;
  }
  // une seule unité (la nôtre ou une autre) : ses points de vie (rafraîchis dans la boucle d'affichage)
  if (ui.selUnits.length === 1 && ui.selUnits[0].count === 1) refreshUnitInfo(c);
  else ui.unitInfo = null;
  refreshGroupMods(c);
  ui.canBuild = ui.selUnits.some((g) => c.data!.units[g.kind].buildPower > 0) && ui.me >= 0 && ui.selForeign < 0;
  if (!ui.canBuild && kb.buildStep) kb.buildStep = "";
  if (selB) {
    void c.query<Record<string, unknown> | null>("building", [selB.ref]).then((r) => (ui.buildingInfo = r));
  } else ui.buildingInfo = null;
  c.plans.tick();
  if (ui.gameOver === null && f.winner !== -1 && ui.replay) ui.gameOver = { winner: f.winner, replay: "", won: false };
}

/** Bâtiment de l'image au mot `o` : type, joueur, en pause (bâtiment de production, BF.ENABLED éteint), terminé. */
function buildingState(c: GameClient, buf: Int32Array, o: number): { ref: number; kind: number; owner: number; paused: boolean; built: boolean; prod: number } {
  const kind = buf[o + 1] & 0xff;
  const cls = c.data?.buildings[kind]?.cls ?? -1;
  return { ref: buf[o] >>> 0, kind, owner: (buf[o + 1] >> 8) & 0xff, paused: pausableClass(cls) && !(((buf[o + 1] >> 20) & 0xff) & BF.ENABLED), built: buf[o + 4] >= 65536, prod: prodOf(buf, o, cls, c.data?.buildings[kind]?.key ?? "") ?? -1 };
}
function findBuildingState(c: GameClient, ref: number): { ref: number; kind: number; owner: number; paused: boolean; built: boolean; prod: number } | null {
  const f = c.frame;
  if (!f) return null;
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) if (f.buf[o] >>> 0 === ref) return buildingState(c, f.buf, o);
  return null;
}

/** Points de vie et vétérance de l'unité sélectionnée seule (fiche de sélection). */
export function refreshUnitInfo(c: GameClient): void {
  c.unitInfoAt = performance.now();
  const g = ui.selUnits.length === 1 && ui.selUnits[0].count === 1 ? ui.selUnits[0] : null;
  if (!g) {
    ui.unitInfo = null;
    return;
  }
  const id = g.ids[0];
  void c.query<{ hp: number; maxHp: number; lvl: number; cloaked?: boolean; radarStealth?: boolean; harvest?: HarvestInfo | null; pack?: number; packLeft?: number; pickup?: PickupInfo | null; deliver?: DeliverInfo | null } | null>("unit", [id]).then((r) => {
    // la sélection a pu changer pendant la requête
    if (ui.selUnits.length === 1 && ui.selUnits[0].count === 1 && ui.selUnits[0].ids[0] === id) ui.unitInfo = r;
  });
}

/** Transhumants : améliorations d'un groupe de porteurs du même type (plusieurs unités, ou plusieurs modules). */
export function refreshGroupMods(c: GameClient): void {
  c.groupModsAt = performance.now();
  const refs = modHosts(c);
  if (!c.data || refs.length < 2) {
    ui.groupMods = null;
    return;
  }
  const b = Ord.isBuildingRef(refs[0]);
  void c.query<Record<string, any> | null>(b ? "building" : "unit", [refs[0]]).then((r) => {
    const now = modHosts(c);
    if (now.length < 2 || now[0] !== refs[0]) return;
    const info = (b ? r?.transh?.mods : r?.mods) as ModInfo | null | undefined;
    ui.groupMods = info ? { info, refs: now } : null;
  });
}
/** Nos unités (ou nos modules) sélectionnés, s'ils sont d'un seul type qui a des améliorations. */
function modHosts(c: GameClient): number[] {
  const d = c.data;
  if (!d || ui.selForeign >= 0 || ui.me < 0) return [];
  if (ui.selUnits.length === 1) return d.mods.some((m) => m.host === ui.selUnits[0].kind) ? ui.selUnits[0].ids : [];
  const own = ui.selBuildings.filter((b) => b.owner === ui.me);
  if (!own.length || ui.selUnits.length || own.some((b) => b.kind !== own[0].kind) || d.buildings[own[0].kind].race !== 2) return [];
  return own.map((b) => b.ref);
}
