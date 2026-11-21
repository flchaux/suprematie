// Enveloppe du module de simulation sim.wasm, identique dans le navigateur, le Worker et Node.js.

export interface SimExports {
  memory: WebAssembly.Memory;
  in_buf(n: number): number;
  out_len(): number;
  init(nWords: number): number;
  step(nWords: number): number;
  render_buffer(x0: number, y0: number, x1: number, y1: number, detail: number, player: number, withVis: number): number;
  snapshot(): number;
  restore(nBytes: number): number;
  data_json(): number;
  map_info(): number;
  map_heights(): number;
  bot_dump(): number;
  info_building(r: number): number;
  info_unit(id: number): number;
  power_zones(player: number): number;
  can_place(owner: number, kind: number, x: number, y: number, dir: number): number;
  twin_preview(nWords: number): number;
  tile_info(x: number, y: number): number;
  building_at(x: number, y: number): number;
  tile_pass(x: number, y: number): number;
  current_tick(): number;
  state_hash(): number;
  game_winner(): number;
  wreck_at(x: number, y: number): number;
  bench_reference(): number;
  logistics_demo(): number;
  weapons_demo(): number;
  projectiles_demo(): number;
  showcase_demo(): number;
  formation_demo(): number;
  unit_orders(nBytes: number): number;
  planned_builds(player: number): number;
  research_queue(player: number): number;
}

const dec = new TextDecoder();

export class Sim {
  readonly ex: SimExports;
  constructor(instance: WebAssembly.Instance) {
    this.ex = instance.exports as unknown as SimExports;
  }

  static async load(bytes: BufferSource): Promise<Sim> {
    const { instance } = await WebAssembly.instantiate(bytes, {});
    return new Sim(instance);
  }

  private writeI32(words: ArrayLike<number>): number {
    const n = words.length;
    const ptr = this.ex.in_buf(n * 4);
    const view = new Int32Array(this.ex.memory.buffer, ptr, n);
    for (let i = 0; i < n; i++) view[i] = words[i] | 0;
    return n;
  }
  private writeBytes(bytes: Uint8Array): number {
    const ptr = this.ex.in_buf(bytes.length);
    new Uint8Array(this.ex.memory.buffer, ptr, bytes.length).set(bytes);
    return bytes.length;
  }
  private outI32(ptr: number): Int32Array {
    const n = this.ex.out_len() >> 2;
    return new Int32Array(this.ex.memory.buffer.slice(ptr, ptr + n * 4));
  }
  private outBytes(ptr: number): Uint8Array {
    const n = this.ex.out_len();
    return new Uint8Array(this.ex.memory.buffer.slice(ptr, ptr + n));
  }
  private outString(ptr: number): string {
    const n = this.ex.out_len();
    return dec.decode(new Uint8Array(this.ex.memory.buffer, ptr, n));
  }

  init(params: number[]): number {
    return this.ex.init(this.writeI32(params)) >>> 0;
  }
  /** Applique les ordres du tick (format plat i32) et renvoie le hash d'état. */
  step(orders: ArrayLike<number>): number {
    return this.ex.step(this.writeI32(orders)) >>> 0;
  }
  render(x0: number, y0: number, x1: number, y1: number, detail: number, player: number, withVis: boolean): Int32Array {
    return this.outI32(this.ex.render_buffer(x0, y0, x1, y1, detail, player, withVis ? 1 : 0));
  }
  snapshot(): Uint8Array {
    return this.outBytes(this.ex.snapshot());
  }
  restore(bytes: Uint8Array): number {
    return this.ex.restore(this.writeBytes(bytes)) >>> 0;
  }
  dataJson(): string {
    return this.outString(this.ex.data_json());
  }
  mapInfo(): Int32Array {
    return this.outI32(this.ex.map_info());
  }
  mapHeights(): Uint8Array {
    return this.outBytes(this.ex.map_heights());
  }
  /** Files d'ordres : par unité, id, x, y, n, puis n fois (code, x, y). */
  unitOrders(ids: number[]): Int32Array {
    const b = new Uint8Array(new Uint32Array(ids.map((x) => x >>> 0)).buffer);
    return this.outI32(this.ex.unit_orders(this.writeBytes(b)));
  }
  /** Constructions prévues d'un joueur : type, x, y, direction. */
  /** File de recherche d'un joueur (technologies dans l'ordre). */
  researchQueue(player: number): Int32Array {
    return this.outI32(this.ex.research_queue(player));
  }
  plannedBuilds(player: number): Int32Array {
    return this.outI32(this.ex.planned_builds(player));
  }
  botDump(): Int32Array {
    return this.outI32(this.ex.bot_dump());
  }
  /** Zones électriques de l'équipe du joueur (voir sim/src/render.rs, power_zones). */
  powerZones(player: number): PowerZones {
    return JSON.parse(this.outString(this.ex.power_zones(player | 0))) as PowerZones;
  }
  infoBuilding(ref: number): unknown {
    return JSON.parse(this.outString(this.ex.info_building(ref >>> 0)));
  }
  infoUnit(id: number): unknown {
    return JSON.parse(this.outString(this.ex.info_unit(id >>> 0)));
  }
  canPlace(owner: number, kind: number, x: number, y: number, dir: number): boolean {
    return this.ex.can_place(owner, kind, x, y, dir) !== 0;
  }
  /**
   * Aperçu de pose des machines jumelles : `args` = [joueur, type, puis (x, y, dir)…] ; par emplacement,
   * les cases de bord collées à une future jumelle (bit côté × 8 + case ; côtés 0 : +x, 1 : +y, 2 : -x, 3 : -y).
   */
  twinPreview(args: number[]): Int32Array {
    return this.outI32(this.ex.twin_preview(this.writeI32(args)));
  }
  tileInfo(x: number, y: number): number {
    return this.ex.tile_info(x, y);
  }
  buildingAt(x: number, y: number): number {
    return this.ex.building_at(x, y) >>> 0;
  }
  tilePass(x: number, y: number): number {
    return this.ex.tile_pass(x, y);
  }
  tick(): number {
    return this.ex.current_tick() >>> 0;
  }
  hash(): number {
    return this.ex.state_hash() >>> 0;
  }
  wreckAt(x: number, y: number): number {
    return this.ex.wreck_at(x, y) >>> 0;
  }
  logisticsDemo(): number {
    return this.ex.logistics_demo() >>> 0;
  }
  weaponsDemo(): number {
    return this.ex.weapons_demo() >>> 0;
  }
  projectilesDemo(): number {
    return this.ex.projectiles_demo() >>> 0;
  }
  showcaseDemo(): number {
    return this.ex.showcase_demo() >>> 0;
  }
  formationDemo(): number {
    return this.ex.formation_demo() >>> 0;
  }
  benchReference(): number {
    return this.ex.bench_reference() >>> 0;
  }
  winner(): number {
    return this.ex.game_winner();
  }
}

/** Zones électriques : réseaux [id, joueur, production, demande, installé, satisfaction, combustible,
 * autonomie s] et poteaux [x, y, l, h, portée, réseau, générateur ?, combustible ‰ (-1 relais), joueur, réf.,
 * type de bâtiment]. */
export interface PowerZones {
  nets: [number, number, number, number, number, number, number, number][];
  poles: [number, number, number, number, number, number, number, number, number, number, number][];
}
