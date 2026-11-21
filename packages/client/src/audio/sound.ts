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

/** Volume des effets sonores (0..1), aussi appliqué aux annonces vocales. */
export function sfxVolume(): number {
  return volume;
}

/** Note de cloche : fondamentale et partiel inharmonique (×2,76), attaque nette, longue décroissance. */
function bell(f: number, delay: number, dur: number, gain: number): void {
  const c = ac();
  if (!c || !master || volume <= 0) return;
  const t = c.currentTime + delay;
  for (const [mult, g] of [[1, gain], [2.76, gain * 0.25], [5.4, gain * 0.08]] as const) {
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.value = f * mult;
    const e = c.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(g, t + 0.006);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur / mult ** 0.4);
    o.connect(e).connect(master);
    o.start(t);
    o.stop(t + dur + 0.1);
  }
}

/** Nappe douce (accord tenu, filtré), attaque lente. */
function pad(freqs: number[], delay: number, dur: number, gain: number): void {
  const c = ac();
  if (!c || !master || volume <= 0) return;
  const t = c.currentTime + delay;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.exponentialRampToValueAtTime(3200, t + dur * 0.4);
  const e = c.createGain();
  e.gain.setValueAtTime(0.0001, t);
  e.gain.exponentialRampToValueAtTime(gain, t + 0.18);
  e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  lp.connect(e).connect(master);
  for (const f of freqs) {
    for (const det of [-6, 6]) {
      const o = c.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }
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
    else if (proj === 9) tone(1800, 420, 0.1, g * 0.55, "sawtooth"); // trait de blaster
    else if (proj === 12) {
      // morsure : craquement sourd et court
      noise(0.07, 650, g * 1.3, 0.5, "lowpass");
      tone(160, 70, 0.08, g * 0.5, "square");
    }
    else if (proj === 13) {
      // crachat acide d'un nid : gargouillis humide
      noise(0.18, 900, g * 1.1, 0.4, "lowpass");
      tone(260, 120, 0.16, g * 0.4, "sine");
    }
    else if (proj === 11) {
      // canon de rail : claquement sec puis sifflement descendant
      noise(0.08, 3200, g * 1.6, 0.9, "highpass");
      tone(2600, 300, 0.22, g * 0.6, "sawtooth");
    }
    else if (proj === 10) {
      // souffle de feu : grondement long
      noise(1.6, 500, g * 2.2, 0.6, "lowpass");
      tone(70, 45, 1.4, g * 1.2, "sawtooth");
    } else noise(0.09, 2400, g, 0.8, "bandpass");
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
  /** Recherche terminée : arpège de cloches montant, nappe d'accord majeur et scintillement final. */
  research(): void {
    if (!throttle("research", 1500)) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => bell(f, i * 0.085, 1.3, 0.07));
    pad([261.63, 392, 523.25, 659.25], 0.28, 1.9, 0.035);
    bell(2093, 0.42, 1.6, 0.03);
    noise(0.5, 7000, 0.025, 0.7, "highpass");
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
