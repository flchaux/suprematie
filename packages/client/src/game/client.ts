// Contrôleur de partie : connexion au relais, Worker de simulation, entrées (souris, clavier),
// sélection, ordres contextuels, placement de bâtiments, minicarte, alertes et sons.
//
// La classe GameClient garde ici son état (ses champs) et sa surface publique ; le code de ses méthodes est réparti par
// thème dans les modules client*.ts de ce dossier, en fonctions libres qui reçoivent le client en premier paramètre.
// Une méthode publique, ou utilisée par l'interface et les scénarios de tools/, reste ici comme une ligne de délégation ;
// les modules l'appellent par `c.xxx()`. Les autres sont appelées directement, d'un module à l'autre.
import type * as THREE from "three/webgpu";
import type * as Ord from "@supreme/shared/orders.ts";
import type { CursorKind } from "../ui/cursors.ts";
import { UF, Layer, Factory, hasTech } from "@supreme/shared";
import type { Frame, GameData, GameStart, PowerZones } from "@supreme/shared";
import type { GameScene } from "../render/scene.ts";
import type { GfxSettings } from "../render/gfx.ts";
import type { MapData } from "../render/terrain.ts";
import { ui } from "./state.svelte.ts";
import { say, setVoiceEnabled } from "../audio/voice.ts";
import { setVolume } from "../audio/sound.ts";
import { setMusicVolume } from "../audio/music.ts";
import { PlanTool } from "./plans.svelte.ts";
import type { MenuRole } from "./gameMenu.ts";
import * as Net from "./clientNet.ts";
import * as Sim from "./clientSim.ts";
import * as View from "./clientView.ts";
import * as Events from "./clientEvents.ts";
import * as UiSync from "./clientUiSync.ts";
import * as Mouse from "./clientMouse.ts";
import * as Keyboard from "./clientKeyboard.ts";
import * as Selection from "./clientSelection.ts";
import * as Orders from "./clientOrders.ts";
import * as Placement from "./clientPlacement.ts";
import * as Buildings from "./clientBuildings.ts";
import * as Minimap from "./clientMinimap.ts";

export class GameClient {
  // ---------- état ----------
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
  selOwn = new Set<number>();
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
  /** fantôme de pose ; `short` : posable, mais le disponible à portée ne couvre pas son coût (cumulé le long de la file) */
  ghostCells: { x: number; y: number; dir: number; ok: boolean; floor?: number; twins?: number; short?: boolean }[] = [];
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

  // pause, vitesse, menu de partie, démo (clientNet.ts)
  replayResume = 1;
  pauseResume = 1;
  pauseSentAt = -1e9;
  pauseAsked = false;
  pauseAskedAt = -1e9;
  menuPaused = false;
  speedAsked = 1;
  speedAskedAt = -1e9;
  /** Démo à ordres locaux (?demo=formation) : les ordres vont directement au worker. */
  demoOrders = false;

  // requêtes en cours pour l'interface (clientUiSync.ts) : date d'envoi (0 : aucune), dernier lieu demandé
  zoneSent = 0;
  reachSent = 0;
  reachKey = "";
  reachAt = 0;

  // cercles de portée : bâtiments de la sélection, relus quatre fois par seconde (clientView.ts)
  rangeBuildings: { at: number; key: string; list: { ref: number; kind: number; x: number; z: number }[] } = { at: 0, key: "", list: [] };

  // navette de transport : point d'embarquement choisi (clientOrders.ts)
  ferryFrom: { x: number; z: number } | null = null;

  // formation au clic droit glissé (clientMouse.ts)
  /** Clic droit glissé : point visé et angle choisi (radians, atan2(dz, dx)), null tant que le geste est trop court. */
  formStart: { x: number; z: number } | null = null;
  formAngle: number | null = null;
  /** Aperçu de la formation pendant le glisser : geste en cours (but, angle, longueur), une requête à la fois. */
  formPreview: { x: number; z: number; angle: number; len: number; queue: boolean } | null = null;
  formAsked = false;

  // sélection (clientSelection.ts)
  /** plus haut point du relief (monde), calculé au premier besoin */
  maxGround = -1;
  /** constructions prévues de notre camp (liste plate : type, x, y, direction), rafraîchie avec l'affichage */
  planned: Int32Array | number[] = [];

  // fiches de la sélection : date de la dernière requête (clientUiSync.ts)
  unitInfoAt = 0;
  groupModsAt = 0;

  // curseur contextuel : forme affichée, date du dernier calcul (clientOrders.ts)
  cursorKind: CursorKind | "" = "";
  cursorAt = 0;

  // mode construction et pose (clientPlacement.ts)
  /** chenillards à placer (le premier est celui du fantôme), pour le mode placement du déploiement */
  deployUnits: { id: number; kind: number }[] = [];
  /**
   * générateur nomade qui plante des poteaux (mode placement des poteaux) : sa référence, le centre de son
   * emprise (cases), ses poteaux (cases), la portée de liaison d'un poteau (cases) et le plafond
   */
  poleGen: { ref: number; cx: number; cy: number; poles: [number, number][]; reach: number; max: number } | null = null;
  /** file de tapis en cours de tracé : direction de la dernière case choisie avec R (null : automatique) */
  lineEndDir: number | null = null;
  /** file en cours de tracé : partie figée par un changement de niveau (molette), avec le niveau de chaque case */
  lineFrozen: { x: number; y: number; dir: number; floor: number }[] = [];
  /** axe du premier tronçon du tronçon en cours (Belts.lockAxis), null tant que le curseur est sur son départ */
  lineAxis: "h" | "v" | null = null;
  /** pose de tapis : direction forcée par R (sinon déduite des tapis voisins) */
  beltForced = false;
  ghostSeq = 0;

  // recherche (clientBuildings.ts)
  /** dernière modification locale de la file de recherche (l'affichage optimiste prime un instant) */
  researchEdit = 0;

  // annonces et alertes (clientEvents.ts), requêtes périodiques de la boucle d'affichage (clientView.ts)
  lastPromo = 0;
  lastOrdersQuery = 0;
  /** dernier dégât subi (base, commandant) : l'annonce ne revient qu'après un répit sans dégât */
  lastBaseHit = -1e9;
  lastCmdHit = -1e9;
  lastPowerAlert = -1e9;
  powerWasLow = false;
  lastPowerShow = 0;
  lastPlannedQuery = 0;
  gifts = new Map<string, number>();
  giftTimer = 0;
  /** butin des Transhumants pas encore annoncé (objets) */
  loot = 0;
  /** Souche : organes épuisés à annoncer (type -> nombre) ; sol mangé : nombre connu, dernière demande, couverture servie */
  spent = new Map<number, number>();
  spentTimer = 0;
  soilSeen = -1;
  lastSoil = 0;
  soilFor: unknown = null;
  lootTimer = 0;

  // ---------- clientNet.ts : réseau, salon, envoi des ordres, pause, vitesse, menu de partie ----------
  connect(name: string): void { Net.connect(this, name); }
  send(m: unknown): void { Net.send(this, m); }
  isSolo(): boolean { return Net.isSolo(this); }
  isHost(): boolean { return Net.isHost(this); }
  canPause(): boolean { return Net.canPause(this); }
  paused(): boolean { return Net.paused(this); }
  setPaused(on: boolean): void { Net.setPaused(this, on); }
  togglePause(): void { Net.togglePause(this); }
  menuRole(): MenuRole { return Net.menuRole(this); }
  openMenu(): void { Net.openMenu(this); }
  closeMenu(): void { Net.closeMenu(this); }
  quitToLobby(load = false): void { Net.quitToLobby(this, load); }
  stepSpeed(delta: number): void { Net.stepSpeed(this, delta); }
  lobbyAction(action: string, extra: Record<string, unknown> = {}): void { Net.lobbyAction(this, action, extra); }
  chat(text: string): void { Net.chat(this, text); }
  cmd(c: Ord.Cmd): void { Net.cmd(this, c); }
  saveGame(): void { Net.saveGame(this); }
  surrender(): void { Net.surrender(this); }

  // ---------- clientSim.ts : démarrage, replay, démos, Worker de simulation ----------
  begin(start: GameStart, snap: { tick: number; data: Uint8Array } | null): Promise<void> { return Sim.begin(this, start, snap); }
  loadReplay(url: string): Promise<void> { return Sim.loadReplay(this, url); }
  startDemo(): void { Sim.startDemo(this); }
  setReplaySpeed(s: number): void { Sim.setReplaySpeed(this, s); }
  stopReplayAt(tick: number): void { Sim.stopReplayAt(this, tick); }
  onWorker(m: { type: string; [k: string]: unknown }): Promise<void> { return Sim.onWorker(this, m); }
  query<T>(q: string, a: number[]): Promise<T> { return Sim.query<T>(this, q, a); }

  // ---------- clientView.ts : boucle d'affichage, caméra, repérage à l'écran ----------
  groundAt(x: number, y: number): THREE.Vector3 | null { return View.groundAt(this, x, y); }
  saveBookmark(i: number): void { View.saveBookmark(this, i); }
  recallBookmark(i: number): void { View.recallBookmark(this, i); }
  centerOnCommander(): void { View.centerOnCommander(this); }
  centerOnSelection(): void { View.centerOnSelection(this); }

  // ---------- clientEvents.ts : événements de la simulation, alertes, pings ----------
  sendPing(x: number, z: number): void { Events.sendPing(this, x, z); }

  // ---------- clientUiSync.ts : état pour l'interface ----------
  queryBuildReach(sc: GameScene): void { UiSync.queryBuildReach(this, sc); }
  updateUi(): void { UiSync.updateUi(this); }

  // ---------- clientMouse.ts : branchement des entrées, souris ----------
  attach(el: HTMLElement, selBox: HTMLDivElement): void { Mouse.attach(this, el, selBox); }

  // ---------- clientKeyboard.ts : clavier, actions des raccourcis ----------
  runAction(id: string, shift = false): void { Keyboard.runAction(this, id, shift); }
  myFactory(): { ref: number; factory: number } | null { return Keyboard.myFactory(this); }

  // ---------- clientSelection.ts : sélection, lecture de l'image ----------
  findBuilding(ref: number): { ref: number; kind: number; owner: number; x: number; y: number } | null { return Selection.findBuilding(this, ref); }
  buildingAtTile(tx: number, tz: number): { ref: number; kind: number; owner: number; x: number; y: number; build: number; hp: number } | null { return Selection.buildingAtTile(this, tx, tz); }
  teamOf(p: number): number { return Selection.teamOf(this, p); }
  selectIdleEngineer(back = false): void { Selection.selectIdleEngineer(this, back); }
  cancelPlan(): void { Selection.cancelPlan(this); }
  depositUser(): { kind: number; owner: number } | null { return Selection.depositUser(this); }
  selectIds(ids: number[]): void { Selection.selectIds(this, ids); }
  selectedUnits(): { id: number; kind: number; x: number; y: number }[] { return Selection.selectedUnits(this); }
  engineers(): number[] { return Selection.engineers(this); }

  // ---------- clientOrders.ts : ordres aux unités, curseur contextuel, modes d'ordre ----------
  ferryClick(x: number, z: number, queue: boolean): void { Orders.ferryClick(this, x, z, queue); }
  setMode(mode: string): void { Orders.setMode(this, mode); }
  cancelMode(): void { Orders.cancelMode(this); }
  installMod(mod: number, refs: number[]): void { Orders.installMod(this, mod, refs); }
  cancelMod(refs: number[]): void { Orders.cancelMod(this, refs); }
  kitSet(kind: number, k: number, set: number[]): void { Orders.kitSet(this, kind, k, set); }
  kitActive(kind: number, k: number): void { Orders.kitActive(this, kind, k); }
  kitApply(set: number[], refs: number[]): void { Orders.kitApply(this, set, refs); }
  arkTurrets(action: 0 | 1 | 2 | 3): void { Orders.arkTurrets(this, action); }
  arkTurretType(k: number, kind: number): void { Orders.arkTurretType(this, k, kind); }
  arkBoost(): void { Orders.arkBoost(this); }
  arkQueue(kind: number, delta: number): void { Orders.arkQueue(this, kind, delta); }
  updateCursor(force = false): void { Orders.updateCursor(this, force); }
  harvestRecipe(raw: number): number { return Orders.harvestRecipe(this, raw); }
  tameMode(): void { Orders.tameMode(this); }
  denLimit(): { have: number; max: number } { return Orders.denLimit(this); }
  deliverSelected(item: number, queue = false): void { Orders.deliverSelected(this, item, queue); }
  stopSelected(): void { Orders.stopSelected(this); }
  deploySelected(): void { Orders.deploySelected(this); }
  towSelected(): boolean { return Orders.towSelected(this); }
  untowSelected(): void { Orders.untowSelected(this); }

  // ---------- clientPlacement.ts : mode construction et pose ----------
  startPole(): void { Placement.startPole(this); }
  startBuild(kind: number): void { Placement.startBuild(this, kind); }
  isBeltKind(): boolean { return Placement.isBeltKind(this); }
  updateGhost(): Promise<void> { return Placement.updateGhost(this); }

  // ---------- clientBuildings.ts : ordres aux bâtiments, recherche, démolition et recyclage ----------
  pausableSelection(): { ref: number; paused: boolean }[] { return Buildings.pausableSelection(this); }
  togglePauseSelected(): void { Buildings.togglePauseSelected(this); }
  hitchCart(): void { Buildings.hitchCart(this); }
  packSelected(): void { Buildings.packSelected(this); }
  foldableSelection(): number[] { return Buildings.foldableSelection(this); }
  queueUnit(kind: number, delta: number): void { Buildings.queueUnit(this, kind, delta); }
  toggleRepeat(on: boolean): void { Buildings.toggleRepeat(this, on); }
  setRecipe(r: number): void { Buildings.setRecipe(this, r); }
  clearResearchQueue(): void { Buildings.clearResearchQueue(this); }
  research(t: number): void { Buildings.research(this, t); }
  queueResearch(t: number): void { Buildings.queueResearch(this, t); }
  adapt(family: number): void { Buildings.adapt(this, family); }
  toggleBuilding(): void { Buildings.toggleBuilding(this); }
  upgradeBuilding(): void { Buildings.upgradeBuilding(this); }
  setWater(pct: number): void { Buildings.setWater(this, pct); }
  setSplit(mode: number): void { Buildings.setSplit(this, mode); }
  setClock(clock: number): void { Buildings.setClock(this, clock); }
  setLot(n: number): void { Buildings.setLot(this, n); }
  emptyStash(): void { Buildings.emptyStash(this); }
  setTurn(quarters: number): void { Buildings.setTurn(this, quarters); }
  setFilters(items: number[]): void { Buildings.setFilters(this, items); }
  setShare(pct: number): void { Buildings.setShare(this, pct); }
  cancelBuilding(): void { Buildings.cancelBuilding(this); }
  demolishSelected(): void { Buildings.demolishSelected(this); }
  removeCarriers(): void { Buildings.removeCarriers(this); }

  // ---------- clientMinimap.ts : minicarte ----------
  attachMinimap(c: HTMLCanvasElement): void { Minimap.attachMinimap(this, c); }

  // ---------- réglages mémorisés dans le navigateur ----------
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
  /** milieu d'une unité (couche et altitude de sa fiche) : un glisseur posé au sol est un amphibie */
  unitLayerName(u: { layer: number; altitude: number }): string {
    if (u.layer === Layer.Hover && !u.altitude) return "Amphibie";
    return ["Terre", "Aéroglisseur", "Mer", "Sous-marin", "Air"][u.layer] ?? "";
  }
  factoryName(f: number): string {
    return ["", "terrestre", "aérienne", "navale", "expérimentale"][f] ?? "";
  }
}

export const client = new GameClient();
export { Layer, Factory, UF };
