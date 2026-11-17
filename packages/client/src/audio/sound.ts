// Sons synthétisés en WebAudio (aucun fichier audio) : tirs, explosions, lasers, alertes, interface.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let volume = 0.5;
const lastPlay = new Map<string, number>();

function ac(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Contexte audio partagé avec la musique (créé et relancé à la demande). */
export function audioContext(): AudioContext | null {
  return ac();
}

export function setVolume(v: number): void {
  volume = v;
  if (master) master.gain.value = v;
}

/** Limite le nombre de sons identiques joués en même temps. */
function throttle(key: string, ms: number): boolean {
  const now = performance.now();
  if ((lastPlay.get(key) ?? 0) + ms > now) return false;
  lastPlay.set(key, now);
  return true;
}

function noise(dur: number, freq: number, gain: number, q = 1, type: BiquadFilterType = "lowpass"): void {
  const c = ac();
  if (!c || !master || !noiseBuf || volume <= 0) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5, dur + 0.05);
}

function tone(f0: number, f1: number, dur: number, gain: number, type: OscillatorType = "sine", delay = 0): void {
  const c = ac();
  if (!c || !master || volume <= 0) return;
  const o = c.createOscillator();
  o.type = type;
  const g = c.createGain();
  const t = c.currentTime + delay;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  /** Tir : proj = type de projectile, near = 0..1 (proximité de la caméra). */
  fire(proj: number, near: number): void {
    if (near <= 0.05 || !throttle("fire" + proj, 45)) return;
    const g = 0.12 * near;
    if (proj === 5 || proj === 8) tone(1400, 300, 0.12, g * 0.6, "sawtooth");
    else if (proj === 6 || proj === 7) tone(900, 200, 0.18, g * 0.7, "square");
    else if (proj === 2) noise(0.35, 1800, g * 0.8, 0.7, "bandpass");
    else if (proj === 1) noise(0.25, 400, g * 1.4);
    else noise(0.09, 2400, g, 0.8, "bandpass");
  },
  explosion(size: number, near: number): void {
    if (near <= 0.05 || !throttle("boom" + Math.min(3, size | 0), 70)) return;
    const big = Math.min(3, size);
    noise(0.4 + big * 0.5, 300 - big * 50, Math.min(0.6, (0.15 + big * 0.15) * near));
    if (big >= 2) tone(90, 30, 1.2, 0.3 * near, "sine");
  },
  laser(near: number): void {
    if (near <= 0.05 || !throttle("laser", 60)) return;
    tone(2200, 600, 0.15, 0.06 * near, "sawtooth");
  },
  click(): void {
    tone(900, 700, 0.05, 0.06, "square");
  },
  confirm(): void {
    tone(600, 900, 0.08, 0.07, "triangle");
  },
  error(): void {
    if (!throttle("err", 200)) return;
    tone(220, 150, 0.15, 0.08, "square");
  },
  built(): void {
    if (!throttle("built", 300)) return;
    tone(660, 660, 0.09, 0.07, "triangle");
    tone(990, 990, 0.12, 0.07, "triangle", 0.09);
  },
  research(): void {
    tone(523, 523, 0.12, 0.08, "triangle");
    tone(659, 659, 0.12, 0.08, "triangle", 0.12);
    tone(784, 784, 0.25, 0.08, "triangle", 0.24);
  },
  alert(): void {
    if (!throttle("alert", 2500)) return;
    tone(880, 880, 0.15, 0.1, "square");
    tone(660, 660, 0.15, 0.1, "square", 0.2);
  },
  nuke(): void {
    for (let i = 0; i < 4; i++) tone(440, 880, 0.35, 0.12, "sawtooth", i * 0.45);
  },
  teleport(near: number): void {
    if (near <= 0.05) return;
    tone(300, 2400, 0.5, 0.1 * near, "sine");
  },
  unlock(): void {
    ac();
  },
};
