// Sons du jeu, tous synthétisés (aucun fichier audio).
//
// Interface et alertes : oscillateurs WebAudio joués en direct.
// Combat : chaque son est calculé une fois, échantillon par échantillon, par audio/synth.ts (dans un
// Worker), en plusieurs variantes, puis rejoué comme un tampon. Chaque tir passe par une voix
// spatialisée (gauche-droite selon l'écran, assourdie au loin), envoie une part de son signal dans
// l'écho d'un terrain ouvert (convolution), puis rejoint un bus commun compressé : une grosse bataille
// reste lisible. Le nombre de voix de combat est plafonné.

import { boomClass, BOOM_MIX, BOOM_NUKE, ORBITAL_MIX, runJob, shotMix, shotSpec, specKey, type Mix, type SynthJob, type SynthResult } from "./synth.ts";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** bus des sons de combat : compresseur, puis volume général */
let bus: AudioNode | null = null;
/** écho du terrain : convolution avec une réponse calculée (voir outdoorImpulse) */
let room: ConvolverNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let volume = 0.5;
const lastPlay = new Map<string, number>();

/** Bruit blanc de 2 s (mono) pour les sons d'interface. */
function noiseBuffer(c: BaseAudioContext): AudioBuffer {
  const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/**
 * Chaîne de sortie des sons de combat : compresseur, puis écrêtage doux (la sortie ne dépasse jamais
 * la pleine échelle, même sous une explosion nucléaire) vers `out` ; écho du terrain en parallèle.
 */
function buildBus(c: BaseAudioContext, out: AudioNode): { bus: AudioNode; room: ConvolverNode } {
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 10;
  comp.ratio.value = 5;
  comp.attack.value = 0.002;
  comp.release.value = 0.14;
  // la courbe couvre une entrée de -2 à 2 (d'où le gain de 0,5 devant) : presque linéaire sous 0,5, arrondie vers ±1
  const half = c.createGain();
  half.gain.value = 0.5;
  const clip = c.createWaveShaper();
  const curve = new Float32Array(1025);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((i / 512 - 1) * 2.2) / Math.tanh(2.2);
  clip.curve = curve;
  comp.connect(half).connect(clip).connect(out);
  const conv = c.createConvolver();
  // la réponse est déjà à l'échelle (énergie 1) : pas de normalisation automatique
  conv.normalize = false;
  conv.connect(comp);
  return { bus: comp, room: conv };
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
      room = b.room;
      ask("ir", 0, { kind: "ir" }, true);
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

// ---------- Sons de combat ----------

/** Ce que le son d'un tir tire de la définition de l'arme. */
export interface WeaponSound {
  proj: number;
  dmg: number;
  aoe: number;
  cooldown: number;
  salvo: number;
  sustain: number;
}

/** Tampons d'un son : ses variantes (calculées à la demande) et leur niveau perçu, celles déjà demandées, la dernière jouée. */
interface Slot {
  bufs: (AudioBuffer | undefined)[];
  loud: number[];
  asked: boolean[];
  last: number;
}
/** Une variante prête à jouer, et le gain qui l'amène au niveau visé. */
interface Ready {
  buf: AudioBuffer;
  gain: number;
}
const slots = new Map<string, Slot>();
const queue: SynthJob[] = [];
const waiting = new Map<number, { key: string; v: number }>();
let current: SynthJob | null = null;
let nextJob = 1;
/** undefined : pas encore créé ; null : indisponible (calcul sur le fil principal) */
let worker: Worker | null | undefined;

function slotOf(key: string): Slot {
  let s = slots.get(key);
  if (!s) slots.set(key, (s = { bufs: [], loud: [], asked: [], last: -1 }));
  return s;
}

/** Résultat d'un calcul : le tampon rejoint son emplacement (ou devient la réponse du terrain). */
function done(res: SynthResult): void {
  const w = waiting.get(res.id);
  waiting.delete(res.id);
  current = null;
  if (w && ctx && res.chans.length && res.chans[0].length) {
    const b = ctx.createBuffer(res.chans.length, res.chans[0].length, ctx.sampleRate);
    res.chans.forEach((ch, i) => b.copyToChannel(ch as Float32Array<ArrayBuffer>, i));
    if (w.key === "ir") {
      if (room) room.buffer = b;
    } else {
      const slot = slotOf(w.key);
      slot.bufs[w.v] = b;
      slot.loud[w.v] = Math.max(0.01, res.loud);
    }
  }
  pump();
}

/** Lance le calcul suivant, un seul à la fois : une demande urgente passe ainsi devant les autres. */
function pump(): void {
  if (current || !queue.length) return;
  current = queue.shift()!;
  if (worker === undefined) {
    try {
      worker = new Worker(new URL("./synthWorker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (e) => done(e.data as SynthResult);
      worker.onerror = () => {
        // Worker indisponible : on reprend le calcul en cours sur le fil principal
        worker = null;
        if (current) queue.unshift(current);
        current = null;
        pump();
      };
    } catch {
      worker = null;
    }
  }
  const job = current;
  if (worker) worker.postMessage(job);
  else setTimeout(() => done(runJob(job)), 0);
}

/** Demande le calcul de la variante `v` d'un son (une seule fois). `urgent` : avant les autres calculs en attente. */
function ask(key: string, v: number, job: Pick<SynthJob, "kind" | "spec" | "cls">, urgent: boolean): void {
  const c = ac();
  const slot = slotOf(key);
  if (!c) return;
  if (slot.asked[v]) {
    // déjà en file : une demande urgente (un tir attend ce son) le fait passer devant
    if (urgent) {
      const i = queue.findIndex((j) => waiting.get(j.id)?.key === key && waiting.get(j.id)?.v === v);
      if (i > 0) queue.unshift(...queue.splice(i, 1));
    }
    return;
  }
  slot.asked[v] = true;
  const j: SynthJob = { ...job, id: nextJob++, seed: v, sr: c.sampleRate };
  waiting.set(j.id, { key, v });
  if (urgent) queue.unshift(j);
  else queue.push(j);
  pump();
}

/**
 * Une variante prête du son `key`, différente de la précédente si possible, avec le gain qui l'amène
 * au niveau visé par `mix`. Null tant qu'aucune n'est calculée (ce tir reste muet). Les autres
 * variantes sont demandées au fil des tirs.
 */
function take(key: string, mix: Mix, job: Pick<SynthJob, "kind" | "spec" | "cls">): Ready | null {
  const slot = slotOf(key);
  const n = mix.variants;
  const ready: number[] = [];
  for (let v = 0; v < n; v++) if (slot.bufs[v]) ready.push(v);
  if (!ready.length) {
    ask(key, 0, job, true);
    return null;
  }
  for (let v = 0; v < n; v++) {
    if (!slot.asked[v]) {
      ask(key, v, job, false);
      break;
    }
  }
  let i = Math.floor(Math.random() * ready.length);
  if (ready.length > 1 && ready[i] === slot.last) i = (i + 1) % ready.length;
  slot.last = ready[i];
  return { buf: slot.bufs[ready[i]]!, gain: Math.pow(10, mix.target / 20) / slot.loud[ready[i]] };
}

/** Voix de combat en cours (plafonnées : au-delà, les sons lointains se taisent). */
let voices = 0;
/** Voix de combat lancées depuis le début (vérifications). */
let played = 0;
const MAX_VOICES = 32;

/**
 * Joue un tampon comme une voix spatialisée. `near` (0 à 1) : proximité de la caméra. Au loin, le son
 * direct faiblit et s'assourdit, alors que l'écho du terrain garde son niveau : il ne reste qu'un
 * coup sourd et sa traîne. `pan` : gauche-droite à l'écran. `delay` (s) : départ différé (salves).
 */
function voice(buf: AudioBuffer, near: number, pan: number, level: number, wet: number, delay = 0, rate = 1): void {
  const c = ctx;
  if (!c || !bus || !room || c.state !== "running") return;
  if (voices >= MAX_VOICES + 12 || (voices >= MAX_VOICES && near < 0.6)) return;
  voices++;
  played++;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 0.5;
  lp.frequency.value = Math.min(c.sampleRate * 0.45, 650 + 19000 * Math.pow(near, 2.4));
  const g = c.createGain();
  g.gain.value = level * (0.08 + 0.92 * Math.pow(near, 1.5));
  const p = c.createStereoPanner();
  p.pan.value = Math.max(-0.8, Math.min(0.8, pan * 0.8));
  src.connect(lp).connect(g).connect(p).connect(bus);
  // l'écho baisse bien moins vite que le son direct, et n'est pas placé (il vient de partout)
  const send = c.createGain();
  send.gain.value = level * wet * (0.2 + 0.25 * Math.pow(near, 0.7));
  lp.connect(send).connect(room);
  src.onended = () => {
    voices--;
    p.disconnect();
    send.disconnect();
  };
  src.start(c.currentTime + 0.004 + delay);
}

export const sfx = {
  /**
   * Tir d'une arme. near = 0..1 (proximité de la caméra), pan = -1..1 (gauche-droite à l'écran). Une
   * salve joue jusqu'à cinq coups échelonnés ; un rayon prolongé joue un son de la durée du rayon.
   */
  fire(w: WeaponSound, near: number, pan = 0): void {
    if (near <= 0.04 || volume <= 0) return;
    const spec = shotSpec(w);
    const key = "s" + specKey(spec);
    const held = spec.sustain > 0;
    if (!throttle(key, held ? 350 : spec.rapid ? 45 : 65)) return;
    const m = shotMix(spec);
    const shots = held ? 1 : Math.min(5, Math.max(1, w.salvo));
    const gap = spec.proj === 2 ? 0.085 : 0.06;
    for (let i = 0; i < shots; i++) {
      const r = take(key, m, { kind: "shot", spec });
      if (!r) return;
      voice(r.buf, near, pan, r.gain, m.wet, i * gap * (0.8 + 0.4 * Math.random()), 0.96 + 0.08 * Math.random());
    }
  },
  /** Explosion de rayon `radius` (cases) ; kind : 2 pour une unité expérimentale, 3 pour une arme nucléaire. */
  explosion(radius: number, kind: number, near: number, pan = 0): void {
    const cls = boomClass(radius, kind);
    // une explosion nucléaire s'entend de partout
    if (cls >= BOOM_NUKE) near = Math.max(near, 0.45);
    if (near <= 0.04 || volume <= 0 || !throttle("b" + cls, cls === 0 ? 45 : 80)) return;
    const m = BOOM_MIX[cls];
    const r = take("b" + cls, m, { kind: "boom", cls });
    if (r) voice(r.buf, near, pan, r.gain, m.wet, 0, 0.94 + 0.12 * Math.random());
  },
  /** Frappe d'un rayon instantané (canon orbital). */
  strike(near: number, pan = 0): void {
    if (near <= 0.04 || volume <= 0 || !throttle("o", 400)) return;
    const r = take("o", ORBITAL_MIX, { kind: "orbital" });
    if (r) voice(r.buf, Math.max(near, 0.3), pan, r.gain, ORBITAL_MIX.wet);
  },
  /** État de la synthèse (vérifications) : tampons prêts, calculs en attente, voix en cours. */
  stats(): { ready: number; pending: number; voices: number; played: number; state: string } {
    let ready = 0;
    for (const s of slots.values()) for (const b of s.bufs) if (b) ready++;
    return { ready, pending: queue.length + (current ? 1 : 0), voices, played, state: ctx?.state ?? "aucun" };
  },
  /** Prépare en tâche de fond les sons des armes du jeu et des explosions (une variante de chacun). */
  warm(weapons: WeaponSound[]): void {
    if (!ac()) return;
    for (let cls = 0; cls <= 3; cls++) ask("b" + cls, 0, { kind: "boom", cls }, false);
    for (const w of weapons) {
      const spec = shotSpec(w);
      ask("s" + specKey(spec), 0, { kind: "shot", spec }, false);
    }
    for (let cls = 4; cls <= BOOM_NUKE; cls++) ask("b" + cls, 0, { kind: "boom", cls }, false);
    ask("o", 0, { kind: "orbital" }, false);
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
