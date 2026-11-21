// Sons synthétisés en WebAudio (aucun fichier audio) : tirs, explosions, lasers, alertes, interface.
//
// Combat : chaque son est fait de couches (claquement, corps, traîne) de bruit filtré et d'oscillateurs,
// avec une saturation douce et une hauteur qui varie un peu d'un tir à l'autre. Il passe par une voix
// spatialisée (à gauche ou à droite selon l'écran, étouffé et plus réverbéré au loin), puis par un bus
// commun compressé : une grosse bataille reste lisible. Le nombre de voix de combat est plafonné.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** bus des sons de combat : compresseur, puis volume général */
let bus: AudioNode | null = null;
/** entrée de la réverbération (salle courte générée) */
let reverb: AudioNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let volume = 0.5;
const lastPlay = new Map<string, number>();

/** Bruit blanc de 2 s (mono), par contexte (contexte réel ou rendu hors ligne). */
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseBuffer(c: BaseAudioContext): AudioBuffer {
  let b = noiseCache.get(c);
  if (!b) {
    b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(c, b);
  }
  return b;
}

/** Réponse impulsionnelle d'une petite salle : bruit stéréo qui décroît en 1,3 s, assombri vers la fin. */
function roomImpulse(c: BaseAudioContext): AudioBuffer {
  const len = Math.floor(c.sampleRate * 1.3);
  const b = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // passe-bas qui se referme : les réflexions tardives sont plus sourdes
      const k = 0.55 + 0.4 * t;
      lp = lp * k + (Math.random() * 2 - 1) * (1 - k);
      d[i] = lp * Math.pow(1 - t, 2.6) * 2.2;
    }
  }
  return b;
}

/** Chaîne de sortie des sons de combat : compresseur vers `out`, réverbération en parallèle. */
function buildBus(c: BaseAudioContext, out: AudioNode): { bus: AudioNode; reverb: AudioNode } {
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 12;
  comp.ratio.value = 5;
  comp.attack.value = 0.003;
  comp.release.value = 0.18;
  comp.connect(out);
  const conv = c.createConvolver();
  conv.buffer = roomImpulse(c);
  const wet = c.createGain();
  wet.gain.value = 0.55;
  conv.connect(wet).connect(comp);
  return { bus: comp, reverb: conv };
}

function ac(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      noiseBuf = noiseBuffer(ctx);
      const b = buildBus(ctx, master);
      bus = b.bus;
      reverb = b.reverb;
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

// ---------- Synthèse des sons de combat ----------

/** Sortie d'une voix : contexte, nœud d'entrée, départ (s). */
interface Out {
  c: BaseAudioContext;
  dst: AudioNode;
  t: number;
}

/** Courbe de saturation douce (tanh), par contexte et par force. */
const shaperCache = new WeakMap<BaseAudioContext, Map<number, WaveShaperNode["curve"]>>();
function shaper(c: BaseAudioContext, drive: number): WaveShaperNode {
  let m = shaperCache.get(c);
  if (!m) shaperCache.set(c, (m = new Map()));
  const k = Math.round(drive * 10);
  let curve = m.get(k);
  if (!curve) {
    const n = 1024;
    const a = new Float32Array(n);
    const g = 1 + k * 1.5;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      a[i] = Math.tanh(x * g) / Math.tanh(g);
    }
    curve = a;
    m.set(k, curve);
  }
  const ws = c.createWaveShaper();
  ws.curve = curve;
  ws.oversample = "2x";
  return ws;
}

/** Enveloppe : montée en `attack`, puis décroissance exponentielle jusqu'à `dur`. */
function env(c: BaseAudioContext, t: number, gain: number, attack: number, dur: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  return g;
}

interface NoiseLayer {
  dur: number;
  type: BiquadFilterType;
  f0: number;
  f1?: number;
  q?: number;
  gain: number;
  attack?: number;
  delay?: number;
  drive?: number;
}
/** Couche de bruit filtré (fréquence qui glisse de f0 à f1), éventuellement saturée. */
function nz(o: Out, l: NoiseLayer): void {
  const c = o.c;
  const t = o.t + (l.delay ?? 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const f = c.createBiquadFilter();
  f.type = l.type;
  f.Q.value = l.q ?? 0.9;
  f.frequency.setValueAtTime(l.f0, t);
  if (l.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, l.f1), t + l.dur);
  const e = env(c, t, l.gain, l.attack ?? 0.002, l.dur);
  let n: AudioNode = src.connect(f);
  if (l.drive) n = n.connect(shaper(c, l.drive));
  n.connect(e).connect(o.dst);
  src.start(t, Math.random() * 1.5, l.dur + 0.05);
}

interface OscLayer {
  type: OscillatorType;
  f0: number;
  f1?: number;
  dur: number;
  gain: number;
  attack?: number;
  delay?: number;
  drive?: number;
  /** passe-bas sur l'oscillateur (Hz) */
  lp?: number;
}
/** Couche d'oscillateur (hauteur qui glisse de f0 à f1). */
function osc(o: Out, l: OscLayer): void {
  const c = o.c;
  const t = o.t + (l.delay ?? 0);
  const v = c.createOscillator();
  v.type = l.type;
  v.frequency.setValueAtTime(l.f0, t);
  if (l.f1 !== undefined) v.frequency.exponentialRampToValueAtTime(Math.max(20, l.f1), t + l.dur);
  const e = env(c, t, l.gain, l.attack ?? 0.003, l.dur);
  let n: AudioNode = v;
  if (l.lp) {
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = l.lp;
    n = n.connect(f);
  }
  if (l.drive) n = n.connect(shaper(c, l.drive));
  n.connect(e).connect(o.dst);
  v.start(t);
  v.stop(t + l.dur + 0.05);
}

/**
 * Recette de chaque famille de projectiles (voir Proj dans sim/src/data.rs). `s` : taille de l'arme
 * (0,7 à 1,8 ; plus grave, plus long et plus fort quand elle grossit), `r` : variation de hauteur.
 * Renvoie la durée du son (s).
 */
const RECIPES: Record<number, (o: Out, s: number, r: number) => number> = {
  // balle : claquement sec, corps saturé, petit coup sourd
  0: (o, s, r) => {
    nz(o, { type: "highpass", f0: 3800, dur: 0.03, gain: 0.45 });
    nz(o, { type: "bandpass", f0: 1300 * r, f1: 520 * r, q: 1.3, dur: 0.09 * s, gain: 0.75, drive: 0.6 });
    osc(o, { type: "sine", f0: 160 * r, f1: 55, dur: 0.08 * s, gain: 0.45 });
    return 0.18 * s;
  },
  // obus (canon, artillerie) : claquement, détonation grave saturée, coup de sub, retombée de débris
  1: (o, s, r) => {
    nz(o, { type: "highpass", f0: 2600, dur: 0.04, gain: 0.45 });
    nz(o, { type: "lowpass", f0: 1000 * r, f1: 110, dur: 0.45 * s, gain: 0.95, drive: 0.45 });
    osc(o, { type: "sine", f0: 95 * r, f1: 32, dur: 0.5 * s, gain: 0.8 });
    nz(o, { type: "bandpass", f0: 2200, q: 0.7, delay: 0.06, dur: 0.28, gain: 0.1, attack: 0.02 });
    return 0.6 * s;
  },
  // missile : allumage, souffle qui monte, sifflement
  2: (o, s, r) => {
    nz(o, { type: "lowpass", f0: 1600, dur: 0.06, gain: 0.4, drive: 0.3 });
    nz(o, { type: "bandpass", f0: 450 * r, f1: 2600 * r, q: 1.6, attack: 0.08, dur: 0.75 * s, gain: 0.5 });
    nz(o, { type: "highpass", f0: 5200, attack: 0.06, dur: 0.5, gain: 0.08 });
    return 0.8 * s;
  },
  // bombe larguée : sifflement qui descend
  3: (o, s, r) => {
    osc(o, { type: "sine", f0: 1700 * r, f1: 480 * r, attack: 0.06, dur: 0.75, gain: 0.12 });
    nz(o, { type: "bandpass", f0: 1300 * r, f1: 500, q: 2, attack: 0.06, dur: 0.65, gain: 0.07 });
    return 0.8 * s;
  },
  // torpille : coup sourd sous l'eau et bulles
  4: (o, s, r) => {
    nz(o, { type: "lowpass", f0: 420, dur: 0.3 * s, gain: 0.6 });
    osc(o, { type: "sine", f0: 190 * r, f1: 70, dur: 0.3 * s, gain: 0.4 });
    for (let i = 0; i < 4; i++) osc(o, { type: "sine", f0: (700 + Math.random() * 700) * r, f1: 1500 * r, delay: 0.06 + i * 0.07 + Math.random() * 0.03, dur: 0.04, gain: 0.05 });
    return 0.5 * s;
  },
  // rayon orbital : grondement saturé qui s'enfonce
  5: (o, s) => {
    osc(o, { type: "sawtooth", f0: 85, f1: 38, attack: 0.1, dur: 1.3, gain: 0.3, drive: 0.5, lp: 900 });
    nz(o, { type: "lowpass", f0: 700, f1: 200, attack: 0.15, dur: 1.3, gain: 0.45 });
    nz(o, { type: "highpass", f0: 4000, attack: 0.05, dur: 0.6, gain: 0.06 });
    return 1.4 * s;
  },
  // plasma : « thoum » rond et grave, corps chaud, souffle bref
  6: (o, s, r) => {
    osc(o, { type: "square", f0: 440 * r, f1: 110 * r, dur: 0.22 * s, gain: 0.18, lp: 1400 });
    osc(o, { type: "sine", f0: 220 * r, f1: 58, dur: 0.32 * s, gain: 0.55 });
    nz(o, { type: "bandpass", f0: 900 * r, f1: 400, q: 1.1, dur: 0.14, gain: 0.25 });
    return 0.38 * s;
  },
  // canon à ions : décharge électrique et grésillements
  7: (o, s, r) => {
    osc(o, { type: "sawtooth", f0: 1500 * r, f1: 180, dur: 0.26 * s, gain: 0.12, lp: 3200, drive: 0.4 });
    for (let i = 0; i < 6; i++) nz(o, { type: "highpass", f0: 2500 + Math.random() * 3000, delay: Math.random() * 0.22, dur: 0.018, gain: 0.25 });
    return 0.35 * s;
  },
  // laser : balayage aigu et harmonique fine
  8: (o, s, r) => {
    osc(o, { type: "sawtooth", f0: 2600 * r, f1: 480 * r, dur: 0.17 * s, gain: 0.12, lp: 6000 });
    osc(o, { type: "sine", f0: 5200 * r, f1: 960 * r, dur: 0.12 * s, gain: 0.05 });
    return 0.2 * s;
  },
  // blaster : « piou » carré filtré, déclic
  9: (o, s, r) => {
    osc(o, { type: "square", f0: 1750 * r, f1: 270 * r, dur: 0.12 * s, gain: 0.13, lp: 4200 });
    osc(o, { type: "sine", f0: 880 * r, f1: 160 * r, dur: 0.1 * s, gain: 0.12 });
    nz(o, { type: "highpass", f0: 4200, dur: 0.02, gain: 0.18 });
    return 0.16 * s;
  },
  // souffle de feu : grondement long, crépitement
  10: (o, s) => {
    nz(o, { type: "lowpass", f0: 650, f1: 420, attack: 0.15, dur: 1.6, gain: 0.85, drive: 0.3 });
    nz(o, { type: "bandpass", f0: 2100, q: 0.8, attack: 0.1, dur: 1.2, gain: 0.14 });
    osc(o, { type: "sawtooth", f0: 62, f1: 44, attack: 0.15, dur: 1.4, gain: 0.12, lp: 300 });
    return 1.7 * s;
  },
  // canon de rail : claquement, résonance métallique, sifflement qui retombe
  11: (o, s, r) => {
    nz(o, { type: "highpass", f0: 3000, dur: 0.05, gain: 0.8 });
    osc(o, { type: "sine", f0: 2100 * r, dur: 0.5, gain: 0.1 });
    osc(o, { type: "sine", f0: 2100 * 2.76 * r, dur: 0.28, gain: 0.04 });
    nz(o, { type: "bandpass", f0: 6200, f1: 1400, q: 2.2, dur: 0.38, gain: 0.16 });
    osc(o, { type: "sine", f0: 120 * r, f1: 50, dur: 0.12 * s, gain: 0.3 });
    return 0.6 * s;
  },
  // morsure : deux craquements et un coup sourd
  12: (o, s, r) => {
    nz(o, { type: "bandpass", f0: 950 * r, q: 1.6, dur: 0.05, gain: 0.6, drive: 0.5 });
    nz(o, { type: "bandpass", f0: 620 * r, q: 1.6, delay: 0.065, dur: 0.06, gain: 0.5, drive: 0.5 });
    osc(o, { type: "sine", f0: 125 * r, f1: 60, dur: 0.09 * s, gain: 0.4 });
    return 0.2 * s;
  },
  // crachat acide : glouglou résonant
  13: (o, s, r) => {
    nz(o, { type: "bandpass", f0: 1150 * r, f1: 300, q: 4, dur: 0.26 * s, gain: 0.55 });
    osc(o, { type: "sine", f0: 300 * r, f1: 120, dur: 0.2, gain: 0.25 });
    osc(o, { type: "sine", f0: 900 * r, f1: 1400 * r, delay: 0.05, dur: 0.05, gain: 0.07 });
    return 0.32 * s;
  },
};

/** Niveau de chaque recette, pour que les familles sonnent à peu près aussi fort (mesuré au rendu hors ligne). */
const LEVEL: Record<number, number> = { 2: 2, 3: 1.7, 4: 1.8, 6: 1.4, 8: 5, 9: 3, 10: 0.65, 11: 1.1, 13: 2.8 };

/** Explosion : claquement, détonation saturée, sub qui s'enfonce, débris. `big` : 0 à 3. */
function explosionLayers(o: Out, big: number): number {
  const r = 0.92 + Math.random() * 0.16;
  nz(o, { type: "highpass", f0: 2200, dur: 0.05, gain: 0.35 + big * 0.1 });
  nz(o, { type: "lowpass", f0: 900 * r, f1: 90, dur: 0.5 + big * 0.55, gain: 0.9, drive: 0.5 });
  osc(o, { type: "sine", f0: 80 * r, f1: 26, dur: 0.6 + big * 0.5, gain: 0.5 + big * 0.2 });
  nz(o, { type: "bandpass", f0: 2600, q: 0.6, delay: 0.08, attack: 0.03, dur: 0.4 + big * 0.3, gain: 0.08 + big * 0.03 });
  return 1.4 + big * 0.6;
}

/** Voix de combat en cours (plafonnée : au-delà, les sons lointains se taisent). */
let voices = 0;
const MAX_VOICES = 28;

/**
 * Voix spatialisée : gain selon la proximité, passe-bas qui se ferme au loin, placement gauche-droite,
 * part réverbérée qui grandit avec la distance. Null si rien ne doit sonner.
 */
function spatial(near: number, pan: number, gain: number, dur: number): Out | null {
  const c = ac();
  if (!c || !bus || !reverb || volume <= 0 || near <= 0.05) return null;
  if (voices >= MAX_VOICES + 12 || (voices >= MAX_VOICES && near < 0.6)) return null;
  voices++;
  setTimeout(() => voices--, dur * 1000 + 50);
  const t = c.currentTime + 0.005;
  const g = c.createGain();
  g.gain.value = gain * (0.2 + 0.8 * near * near);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1400 + 17000 * near * near;
  const p = c.createStereoPanner();
  p.pan.value = Math.max(-0.85, Math.min(0.85, pan));
  g.connect(lp).connect(p).connect(bus);
  const send = c.createGain();
  send.gain.value = 0.12 + 0.5 * (1 - near);
  p.connect(send).connect(reverb);
  return { c, dst: g, t };
}

/** Taille d'une arme pour le son, d'après ses dégâts et son rayon d'effet (0,7 à 1,8). */
export function weaponSize(dmg: number, aoe: number): number {
  return Math.max(0.7, Math.min(1.8, 0.55 + Math.log10(Math.max(1, dmg)) * 0.3 + aoe / 1800));
}

/**
 * Rendu hors ligne d'un son de tir (ou d'une explosion : proj = -1 - taille), pour la vitrine et les
 * vérifications : échantillons stéréo mélangés en mono, à 44,1 kHz.
 */
export async function renderOffline(proj: number, size = 1): Promise<Float32Array> {
  const sr = 44100;
  const c = new OfflineAudioContext(2, sr * 3, sr);
  const out = c.createGain();
  out.gain.value = 0.5;
  out.connect(c.destination);
  const b = buildBus(c, out);
  const g = c.createGain();
  g.gain.value = 0.3 * (proj >= 0 ? (LEVEL[proj] ?? 1) : 1);
  g.connect(b.bus);
  const send = c.createGain();
  send.gain.value = 0.2;
  g.connect(send).connect(b.reverb);
  const o: Out = { c, dst: g, t: 0.01 };
  if (proj < 0) explosionLayers(o, -1 - proj);
  else (RECIPES[proj] ?? RECIPES[0])(o, size, 1);
  const buf = await c.startRendering();
  const l = buf.getChannelData(0);
  const r = buf.getChannelData(1);
  const m = new Float32Array(l.length);
  for (let i = 0; i < l.length; i++) m[i] = (l[i] + r[i]) / 2;
  return m;
}

export const sfx = {
  /**
   * Tir : proj = type de projectile, near = 0..1 (proximité de la caméra), pan = -1..1 (gauche-droite à
   * l'écran), size = taille de l'arme (voir weaponSize).
   */
  fire(proj: number, near: number, pan = 0, size = 1): void {
    if (near <= 0.05 || !throttle("fire" + proj, proj === 0 || proj === 9 ? 35 : 55)) return;
    const recipe = RECIPES[proj] ?? RECIPES[0];
    const o = spatial(near, pan, 0.32 * Math.min(1.4, size) * (LEVEL[proj] ?? 1), 1.8);
    if (!o) return;
    const r = (0.94 + Math.random() * 0.12) / Math.pow(size, 0.35);
    recipe(o, size, r);
  },
  explosion(size: number, near: number, pan = 0): void {
    if (near <= 0.05 || !throttle("boom" + Math.min(3, size | 0), 70)) return;
    const big = Math.min(3, size);
    const o = spatial(near, pan, 0.45 + big * 0.12, 3);
    if (o) explosionLayers(o, big);
  },
  laser(near: number, pan = 0): void {
    if (near <= 0.05 || !throttle("laser", 60)) return;
    const o = spatial(near, pan, 0.3 * (LEVEL[8] ?? 1), 0.4);
    if (o) RECIPES[8](o, 1, 0.94 + Math.random() * 0.12);
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
