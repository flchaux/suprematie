// Musique de fond : les morceaux alternent en fondu enchaîné, seul le premier est attendu au démarrage,
// chaque morceau est décodé peu avant son entrée, et un morceau introuvable laisse le précédent reprendre.
// Faux AudioContext dont l'horloge suit les minuteries simulées de Vitest.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const DURATION = 145;

interface Started {
  name: string;
  at: number;
  ramps: [number, number][];
}

let started: Started[];
let fetched: string[];
let failing: (url: string) => boolean;
let t0: number;

function fakeContext() {
  const param = (log?: [number, number][]) => ({
    value: 1,
    setValueAtTime() {},
    linearRampToValueAtTime(v: number, t: number) {
      log?.push([v, t]);
    },
    setTargetAtTime() {},
    cancelScheduledValues() {},
  });
  const ctx = {
    get currentTime() {
      return (Date.now() - t0) / 1000;
    },
    destination: {},
    createGain() {
      const ramps: [number, number][] = [];
      return { gain: param(ramps), ramps, context: ctx, connect: (n: unknown) => n };
    },
    createBufferSource() {
      const src = {
        buffer: null as null | { name: string; duration: number },
        connect: (g: { ramps: [number, number][] }) => {
          (src as { gain?: unknown }).gain = g;
          return g;
        },
        start(at: number) {
          started.push({ name: src.buffer!.name, at, ramps: (src as unknown as { gain: { ramps: [number, number][] } }).gain.ramps });
        },
        stop() {},
      };
      return src;
    },
    async decodeAudioData(bytes: ArrayBuffer) {
      return { name: new TextDecoder().decode(bytes), duration: DURATION };
    },
  };
  return ctx;
}

async function load() {
  vi.resetModules();
  const ctx = fakeContext();
  vi.doMock("../src/audio/sound.ts", () => ({ audioContext: () => ctx }));
  const music = await import("../src/audio/music.ts");
  return { music, ctx };
}

/** Avance l'horloge (minuteries et AudioContext) jusqu'à l'instant `t` (secondes depuis le début). */
async function until(t: number) {
  await vi.advanceTimersByTimeAsync(Math.max(0, t * 1000 - (Date.now() - t0)));
}

const track = (s: Started) => (/theme2/.test(s.name) ? 2 : 1);

beforeEach(() => {
  vi.useFakeTimers();
  t0 = Date.now();
  started = [];
  fetched = [];
  failing = () => false;
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("addEventListener", () => {});
  vi.stubGlobal("removeEventListener", () => {});
  vi.stubGlobal("fetch", async (url: string) => {
    fetched.push(url);
    if (failing(url)) return { ok: false, arrayBuffer: async () => new ArrayBuffer(0) };
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode(url).buffer };
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.doUnmock("../src/audio/sound.ts");
});

describe("musique de fond", () => {
  it("démarre sur le premier morceau, puis télécharge le second", async () => {
    const { music } = await load();
    const p = music.startMusic();
    // seul le premier morceau est demandé avant le démarrage
    expect(fetched.length).toBe(1);
    expect(fetched[0]).toMatch(/theme\.mp3/);
    await p;
    expect(started.length).toBe(1);
    expect(track(started[0])).toBe(1);
    expect(music.musicState()).toMatchObject({ playing: true, track: 0, passes: 1, requested: 2 });
    expect(fetched.length).toBe(2);
    expect(fetched[1]).toMatch(/theme2\.mp3/);
  });

  it("alterne les morceaux, chacun entrant pendant le fondu de sortie du précédent", async () => {
    const { music } = await load();
    await music.startMusic();
    const first = started[0].at;
    // le suivant n'est pas encore programmé 21 s avant sa propre entrée…
    await until(first + DURATION - 6 - 21);
    expect(started.length).toBe(1);
    // …il l'est 20 s avant
    await until(first + DURATION - 6 - 19);
    expect(started.length).toBe(2);
    for (let i = 2; i < 6; i++) await until(started[i - 1].at + DURATION - 6 - 19);
    expect(started.map(track)).toEqual([1, 2, 1, 2, 1, 2]);
    for (let i = 1; i < started.length; i++) {
      // entrée exactement 6 s avant la fin du précédent, fondu d'entrée de 6 s
      expect(started[i].at).toBeCloseTo(started[i - 1].at + DURATION - 6, 6);
      expect(started[i].ramps[0]).toEqual([1, started[i].at + 6]);
    }
    // fondu de sortie de 6 s jusqu'à la fin du morceau
    const last = started[0].ramps.at(-1)!;
    expect(last[1]).toBeCloseTo(started[0].at + DURATION, 6);
    expect(music.musicState().passes).toBe(6);
  });

  it("rejoue le même morceau si le suivant ne se charge pas, puis réessaie", async () => {
    failing = (url) => /theme2/.test(url);
    const { music } = await load();
    await music.startMusic();
    await until(started[0].at + DURATION - 6 - 19);
    expect(started.map(track)).toEqual([1, 1]);
    failing = () => false;
    await until(started[1].at + DURATION - 6 - 19);
    expect(started.map(track)).toEqual([1, 1, 2]);
  });

  it("skipMusic enchaîne tout de suite sur le morceau suivant", async () => {
    const { music } = await load();
    await music.startMusic();
    await until(10);
    music.skipMusic();
    await until(10.1);
    expect(started.map(track)).toEqual([1, 2]);
    expect(started[1].at).toBeCloseTo(10.05, 1);
    expect(music.musicState()).toMatchObject({ track: 1, passes: 2 });
  });

  it("ne démarre pas à volume nul", async () => {
    const { music } = await load();
    music.setMusicVolume(0);
    await music.startMusic();
    expect(started.length).toBe(0);
    expect(fetched.length).toBe(0);
  });
});
