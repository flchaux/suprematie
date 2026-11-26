// Synthèse des sons de combat, échantillon par échantillon : aucun fichier audio, aucun nœud WebAudio.
// Chaque son est calculé une fois (tampon mono), puis rejoué par audio/sound.ts. Ce module ne dépend
// de rien : il tourne aussi sous Node (tests, outil d'écoute tools/sounds/render.ts).
//
// Principes :
// - une détonation est un bruit découpé en bandes, chacune avec sa décroissance (les aigus meurent en
//   quelques millisecondes, les graves traînent), plus une onde de bouche et un coup grave dont la
//   hauteur chute ; le tout passe dans une saturation, comme un micro qui encaisse ;
// - un trait d'énergie est une impulsion dispersée par une chaîne de filtres passe-tout : les aigus
//   sortent d'abord, les graves ensuite (le « piou » d'un câble tendu que l'on frappe) ;
// - un rayon tenu est une grappe d'oscillateurs désaccordés, modulée et grésillante, qui dure le temps du tir ;
// - chaque son existe en plusieurs variantes (graine), pour que deux tirs de suite ne soient pas identiques.

const TAU = Math.PI * 2;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Générateur aléatoire à graine (mulberry32) : un son donné est toujours le même. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  /** 0..1 */
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** -1..1 */
  bi(): number {
    return this.next() * 2 - 1;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
}

type Color = "white" | "pink" | "brown";

/** Source de bruit : blanc, rose (-3 dB par octave) ou brun (-6 dB par octave). */
function noiseGen(rng: Rng, color: Color): () => number {
  if (color === "white") return () => rng.bi();
  if (color === "pink") {
    let b0 = 0, b1 = 0, b2 = 0;
    return () => {
      const w = rng.bi();
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      return (b0 + b1 + b2 + w * 0.1848) * 0.25;
    };
  }
  let b = 0;
  return () => {
    b = (b + 0.02 * rng.bi()) / 1.02;
    return b * 3.5;
  };
}

type Mode = "lp" | "bp" | "hp";
type Freq = number | ((t: number) => number);

/** Filtre à variable d'état (stable quand sa fréquence bouge) ; le passe-bande a un gain de 1 au centre. */
export function svf(x: Float32Array, sr: number, mode: Mode, fc: Freq, q: number): Float32Array {
  const y = new Float32Array(x.length);
  const k = 1 / q;
  let ic1 = 0, ic2 = 0, a1 = 0, a2 = 0, a3 = 0;
  const set = (f: number) => {
    const g = Math.tan((Math.PI * Math.min(0.46 * sr, Math.max(12, f))) / sr);
    a1 = 1 / (1 + g * (g + k));
    a2 = g * a1;
    a3 = g * a2;
  };
  const fn = typeof fc === "function" ? fc : null;
  if (!fn) set(fc as number);
  for (let i = 0; i < x.length; i++) {
    if (fn && (i & 15) === 0) set(fn(i / sr));
    const v3 = x[i] - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    y[i] = mode === "lp" ? v2 : mode === "bp" ? k * v1 : x[i] - k * v1 - v2;
  }
  return y;
}

function rms(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, x.length));
}

function peak(x: Float32Array): number {
  let p = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a > p) p = a;
  }
  return p;
}

interface NoiseOpts {
  /** départ (s) */
  at?: number;
  mode?: Mode;
  /** fréquence du filtre (Hz), fixe ou fonction du temps */
  f: Freq;
  q?: number;
  /** niveau efficace de la couche avant enveloppe */
  gain: number;
  /** montée (s), palier (s), constante de décroissance (s) */
  attack?: number;
  hold?: number;
  tau: number;
  color?: Color;
  /** modulation d'amplitude en plus de l'enveloppe */
  am?: (t: number) => number;
}

/** Couche de bruit filtré : montée, palier, décroissance exponentielle. */
function noiseLayer(o: Float32Array, sr: number, rng: Rng, p: NoiseOpts): void {
  const at = Math.floor((p.at ?? 0) * sr);
  const attack = p.attack ?? 0.0008;
  const hold = p.hold ?? 0;
  const n = Math.min(o.length - at, Math.ceil((attack + hold + p.tau * 7) * sr));
  if (n <= 0) return;
  const x = new Float32Array(n);
  const gen = noiseGen(rng, p.color ?? "white");
  for (let i = 0; i < n; i++) x[i] = gen();
  const y = svf(x, sr, p.mode ?? "bp", p.f, p.q ?? 1);
  const g = p.gain / Math.max(1e-6, rms(y));
  const kd = Math.exp(-1 / (p.tau * sr));
  const na = Math.max(1, Math.floor(attack * sr));
  const nh = na + Math.floor(hold * sr);
  let e = 1;
  for (let i = 0; i < n; i++) {
    let v: number;
    if (i < na) v = i / na;
    else if (i < nh) v = 1;
    else v = e *= kd;
    if (p.am) v *= p.am(i / sr);
    o[at + i] += y[i] * v * g;
  }
}

/** Correction des marches d'une onde en dents de scie ou carrée (polyBLEP) : pas de repliement audible. */
function blep(t: number, dt: number): number {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

interface ToneOpts {
  at?: number;
  /** hauteur : de f0 vers f1 avec la constante tauPitch, ou fonction du temps */
  f0: number;
  f1?: number;
  tauPitch?: number;
  fn?: (t: number) => number;
  gain: number;
  attack?: number;
  hold?: number;
  tau: number;
  shape?: "sine" | "saw" | "square";
  /** modulation de fréquence : rapport de la modulante, indice de départ, décroissance de l'indice (s) */
  fmRatio?: number;
  fmIndex?: number;
  fmTau?: number;
  am?: (t: number) => number;
}

/** Couche d'oscillateur : hauteur glissante, modulation de fréquence facultative. */
function toneLayer(o: Float32Array, sr: number, p: ToneOpts): void {
  const at = Math.floor((p.at ?? 0) * sr);
  const attack = p.attack ?? 0.001;
  const hold = p.hold ?? 0;
  const n = Math.min(o.length - at, Math.ceil((attack + hold + p.tau * 7) * sr));
  if (n <= 0) return;
  const f1 = p.f1 ?? p.f0;
  const tp = p.tauPitch ?? p.tau;
  const kd = Math.exp(-1 / (p.tau * sr));
  const kp = Math.exp(-1 / (tp * sr));
  const kf = p.fmTau ? Math.exp(-1 / (p.fmTau * sr)) : 1;
  const na = Math.max(1, Math.floor(attack * sr));
  const nh = na + Math.floor(hold * sr);
  const shape = p.shape ?? "sine";
  let ph = 0, mph = 0, e = 1, df = p.f0 - f1, idx = p.fmIndex ?? 0;
  for (let i = 0; i < n; i++) {
    const f = p.fn ? p.fn(i / sr) : f1 + df;
    df *= kp;
    const dt = f / sr;
    ph += dt;
    if (ph >= 1) ph -= Math.floor(ph);
    let s: number;
    if (shape === "sine") {
      if (p.fmRatio) {
        mph += dt * p.fmRatio;
        s = Math.sin(TAU * ph + idx * Math.sin(TAU * mph));
        idx *= kf;
      } else s = Math.sin(TAU * ph);
    } else if (shape === "saw") s = 2 * ph - 1 - blep(ph, dt);
    else s = (ph < 0.5 ? 1 : -1) + blep(ph, dt) - blep((ph + 0.5) % 1, dt);
    let v: number;
    if (i < na) v = i / na;
    else if (i < nh) v = 1;
    else v = e *= kd;
    if (p.am) v *= p.am(i / sr);
    o[at + i] += s * v * p.gain;
  }
}

/** Onde de bouche : une impulsion en N (montée brutale, retour sous zéro) suivie d'un souffle aigu très bref. */
function crack(o: Float32Array, sr: number, rng: Rng, p: { at?: number; gain: number; width: number; fc: number; tau: number }): void {
  const at = Math.floor((p.at ?? 0) * sr);
  const w = Math.max(4, Math.floor(p.width * sr));
  for (let i = 0; i < w && at + i < o.length; i++) o[at + i] += p.gain * (1 - (2 * i) / w);
  noiseLayer(o, sr, rng, { at: p.at, mode: "hp", f: p.fc, q: 0.7, gain: p.gain * 0.55, attack: 0.0003, tau: p.tau });
}

/** Partiels amortis (résonance d'une pièce de métal) : [fréquence, décroissance (s), niveau]. */
function modes(o: Float32Array, sr: number, at: number, list: [number, number, number][], bend = 0): void {
  const a = Math.floor(at * sr);
  for (const [f, tau, g] of list) {
    const n = Math.min(o.length - a, Math.ceil(tau * 6 * sr));
    const kd = Math.exp(-1 / (tau * sr));
    let e = 1, ph = 0;
    for (let i = 0; i < n; i++) {
      ph += (f * (1 - bend * (i / sr))) / sr;
      o[a + i] += Math.sin(TAU * ph) * (e *= kd) * g * Math.min(1, i / (0.0006 * sr));
    }
  }
}

/**
 * Grains épars (débris, étincelles, bulles) : de brèves sinusoïdes amorties tirées au hasard, dont la
 * cadence décroît. `glide` : glissement de hauteur de chaque grain (bulle : la hauteur monte).
 */
function grains(o: Float32Array, sr: number, rng: Rng, p: { at?: number; dur: number; rate: number; tauRate: number; lo: number; hi: number; tau: number; gain: number; glide?: number }): void {
  let t = p.at ?? 0;
  const end = t + p.dur;
  const t0 = t;
  for (;;) {
    const rate = p.rate * Math.exp(-(t - t0) / p.tauRate);
    if (rate < 0.5) break;
    t += -Math.log(1 - rng.next() * 0.999) / rate;
    if (t >= end) break;
    const f = p.lo * Math.pow(p.hi / p.lo, rng.next());
    const g = p.gain * (0.25 + 0.75 * rng.next() ** 2) * Math.exp(-(t - t0) / (p.tauRate * 1.5));
    const a = Math.floor(t * sr);
    const n = Math.min(o.length - a, Math.ceil(p.tau * 5 * sr));
    const kd = Math.exp(-1 / (p.tau * sr));
    let e = 1, ph = rng.next();
    for (let i = 0; i < n; i++) {
      ph += (f * (1 + (p.glide ?? 0) * (i / sr))) / sr;
      o[a + i] += Math.sin(TAU * ph) * (e *= kd) * g;
    }
  }
}

/**
 * Dispersion : une chaîne de filtres passe-tout du premier ordre retarde les graves bien plus que les
 * aigus. Une impulsion en ressort étalée en un glissement de l'aigu vers le grave.
 */
function disperse(x: Float32Array, a: number, stages: number): void {
  for (let s = 0; s < stages; s++) {
    let x1 = 0, y1 = 0;
    for (let i = 0; i < x.length; i++) {
      const xi = x[i];
      const y = a * xi + x1 - a * y1;
      x1 = xi;
      y1 = y;
      x[i] = y;
    }
  }
}

/** Saturation douce de tout le tampon : niveau ramené à 1, puis tanh (densité, harmoniques des graves). */
function saturate(o: Float32Array, drive: number): void {
  const p = peak(o);
  if (p < 1e-9) return;
  const k = drive / p;
  const norm = 1 / Math.tanh(drive);
  for (let i = 0; i < o.length; i++) o[i] = Math.tanh(o[i] * k) * norm;
}

/** Réflexion proche (sol, coque) : une copie retardée de quelques millisecondes colore le son comme une prise réelle. */
function reflect(o: Float32Array, sr: number, delay: number, gain: number): void {
  const d = Math.max(1, Math.floor(delay * sr));
  for (let i = o.length - 1; i >= d; i--) o[i] += gain * o[i - d];
}

/** Bruit lent (0..1) pour les turbulences : valeurs tirées `rate` fois par seconde, reliées en douceur. */
function wobble(rng: Rng, rate: number, dur: number): (t: number) => number {
  const n = Math.ceil(dur * rate) + 3;
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) v[i] = rng.next();
  return (t: number) => {
    const x = t * rate;
    const i = Math.min(n - 2, Math.floor(x));
    const u = x - i;
    const s = u * u * (3 - 2 * u);
    return v[i] + (v[i + 1] - v[i]) * s;
  };
}

/** Finition : coupe le continu et l'infra-grave, retire la fin inaudible (sous -56 dB), la fond, ramène la crête à 0,97. */
function finish(o: Float32Array, sr: number, hp = 28): Float32Array {
  const f = svf(o, sr, "hp", hp, 0.7);
  const p = peak(f);
  if (p < 1e-9) return f;
  let end = f.length;
  while (end > 64 && Math.abs(f[end - 1]) < p * 0.0016) end--;
  end = Math.min(f.length, end + Math.floor(0.03 * sr));
  const y = f.slice(0, end);
  const nf = Math.min(end, Math.floor(0.03 * sr));
  for (let i = 0; i < nf; i++) y[end - 1 - i] *= i / nf;
  const g = 0.97 / p;
  for (let i = 0; i < end; i++) y[i] *= g;
  return y;
}

// ---------- Recettes ----------

/** Balle : de la mitrailleuse antiaérienne (petite, rapide) au canon de char ou de navire. */
function gun(sr: number, rng: Rng, size: number, rapid: boolean): Float32Array {
  const u = clamp01((size - 0.7) / 0.9);
  const k = rapid ? 0.62 : 1;
  const o = new Float32Array(Math.ceil(((0.4 + 1.2 * u) * k + 0.15) * sr));
  const p = (1.35 - 0.8 * u) * rng.range(0.94, 1.06);
  crack(o, sr, rng, { gain: 1.1, width: 0.0004 + 0.0009 * u, fc: 3200 * p, tau: 0.003 + 0.006 * u });
  // détonation : six bandes, les aigus meurent d'abord
  const base = (0.017 + 0.055 * u) * k;
  const bands: [number, number, number][] = [[210, 1.8, 0.8], [430, 1.4, 1], [880, 1, 0.95], [1750, 0.7, 0.75], [3500, 0.45, 0.5], [7000, 0.28, 0.3]];
  for (const [f, t, g] of bands) noiseLayer(o, sr, rng, { f: f * p, q: 1.1, tau: base * t * rng.range(0.88, 1.12), gain: g });
  // résonances du tube : deux bandes étroites qui donnent sa note à l'arme
  const tube = (760 - 430 * u) * rng.range(0.9, 1.1);
  noiseLayer(o, sr, rng, { f: tube, q: 9, tau: base * 1.5, gain: 0.55 });
  noiseLayer(o, sr, rng, { f: tube * 2.37, q: 11, tau: base * 0.9, gain: 0.4 });
  // coup grave dont la hauteur chute
  toneLayer(o, sr, { f0: (240 - 120 * u) * rng.range(0.95, 1.05), f1: 64 - 26 * u, tauPitch: 0.012 + 0.03 * u, tau: (0.04 + 0.13 * u) * k, gain: (rapid ? 0.6 : 0.9) + 0.9 * u });
  saturate(o, 2.4 + 2.6 * u);
  reflect(o, sr, rng.range(0.0011, 0.0026), -0.35);
  if (rapid || u < 0.35) {
    // petite arme : claquement métallique de la culasse
    const m = rng.range(0.9, 1.15);
    modes(o, sr, 0.006, [[1900 * m, 0.012, 0.07], [2950 * m, 0.009, 0.06], [4300 * m, 0.006, 0.05]]);
  } else {
    // gros canon : le sol tremble
    noiseLayer(o, sr, rng, { mode: "lp", f: 130, q: 0.7, color: "brown", attack: 0.02, tau: 0.16 + 0.3 * u, gain: 0.22 * u });
  }
  // traîne propre de l'arme (l'écho du terrain est ajouté à la lecture)
  noiseLayer(o, sr, rng, { mode: "lp", f: (t) => 500 + 2600 * p * Math.exp(-t / (0.05 + 0.1 * u)), q: 0.7, color: "pink", attack: 0.004, tau: (0.06 + 0.22 * u) * k, gain: 0.09 });
  return finish(o, sr);
}

/** Obus d'artillerie : départ lourd, souffle, grondement. */
function shell(sr: number, rng: Rng, size: number): Float32Array {
  const u = clamp01((size - 1.2) / 0.6);
  const o = new Float32Array(Math.ceil((1.5 + 0.9 * u) * sr));
  const p = (0.95 - 0.3 * u) * rng.range(0.95, 1.05);
  crack(o, sr, rng, { gain: 1.1, width: 0.0013, fc: 2200, tau: 0.008 });
  const base = 0.075 + 0.05 * u;
  const bands: [number, number, number][] = [[110, 2, 0.95], [220, 1.6, 1], [450, 1.15, 0.9], [900, 0.8, 0.7], [1800, 0.5, 0.45], [3600, 0.3, 0.3], [7200, 0.18, 0.18]];
  for (const [f, t, g] of bands) noiseLayer(o, sr, rng, { f: f * p, q: 1.1, tau: base * t * rng.range(0.9, 1.1), gain: g });
  toneLayer(o, sr, { f0: 125 * p, f1: 36, tauPitch: 0.045, tau: 0.26 + 0.12 * u, gain: 1.7 });
  toneLayer(o, sr, { f0: 62 * p, f1: 27, tauPitch: 0.09, tau: 0.34 + 0.2 * u, gain: 0.8 });
  saturate(o, 4.2);
  reflect(o, sr, rng.range(0.002, 0.004), -0.3);
  // souffle du départ, puis grondement qui roule
  noiseLayer(o, sr, rng, { f: (t) => 300 + 900 * Math.exp(-((t - 0.09) ** 2) / 0.006), q: 0.8, attack: 0.07, tau: 0.22, gain: 0.1 });
  const w = wobble(rng, 9, 3);
  noiseLayer(o, sr, rng, { mode: "lp", f: 150, q: 0.7, color: "brown", attack: 0.05, tau: 0.5 + 0.3 * u, gain: 0.28, am: (t) => 0.55 + 0.9 * w(t) });
  noiseLayer(o, sr, rng, { mode: "lp", f: (t) => 350 + 2200 * Math.exp(-t / 0.18), q: 0.7, color: "pink", attack: 0.01, tau: 0.35, gain: 0.1 });
  return finish(o, sr);
}

/** Missile ou roquette : coup d'allumage, rugissement turbulent qui s'éloigne, sifflement. */
function missile(sr: number, rng: Rng, size: number, rapid: boolean): Float32Array {
  const u = clamp01((size - 1) / 0.6);
  const life = rapid ? 0.22 : 0.3 + 0.35 * u;
  const o = new Float32Array(Math.ceil((life * 4.5 + 0.35) * sr));
  const p = (1.25 - 0.5 * u) * rng.range(0.93, 1.07);
  // allumage
  for (const [f, t, g] of [[380, 1.5, 0.8], [900, 1, 1], [2200, 0.6, 0.7], [5200, 0.35, 0.4]] as [number, number, number][])
    noiseLayer(o, sr, rng, { f: f * p, q: 1, tau: 0.022 * t, gain: g });
  toneLayer(o, sr, { f0: 170 * p, f1: 60, tauPitch: 0.02, tau: 0.06 + 0.05 * u, gain: 1 });
  saturate(o, 2.5);
  // tuyère : bande qui monte à l'allumage puis redescend (le missile s'éloigne), turbulences
  const w1 = wobble(rng, 38, 4);
  const w2 = wobble(rng, 11, 4);
  const turb = (t: number) => 0.45 + 0.75 * w1(t) * (0.6 + 0.8 * w2(t));
  const fr = (t: number) => (520 + 1500 * (1 - Math.exp(-t / 0.05)) * Math.exp(-t / (life * 1.6))) * p;
  noiseLayer(o, sr, rng, { at: 0.004, f: fr, q: 0.75, attack: 0.035, hold: life * 0.5, tau: life, gain: 0.55, am: turb });
  noiseLayer(o, sr, rng, { at: 0.004, mode: "lp", f: 260 * p, q: 0.8, color: "brown", attack: 0.05, hold: life * 0.5, tau: life * 1.1, gain: 0.4 + 0.25 * u, am: turb });
  noiseLayer(o, sr, rng, { at: 0.004, mode: "hp", f: 4800, q: 0.7, attack: 0.03, hold: life * 0.2, tau: life * 0.5, gain: 0.12 });
  // sifflement du départ
  noiseLayer(o, sr, rng, { f: (t) => (900 + 2600 * (1 - Math.exp(-t / 0.12))) * p, q: 7, attack: 0.05, tau: life * 0.6, gain: 0.07 });
  return finish(o, sr);
}

/** Bombe larguée : déclic de la soute, sifflement qui descend en s'amplifiant. */
function bomb(sr: number, rng: Rng, size: number): Float32Array {
  const u = clamp01((size - 1.3) / 0.5);
  const dur = 0.75 + 0.25 * u;
  const o = new Float32Array(Math.ceil((dur + 0.15) * sr));
  const p = (1.15 - 0.4 * u) * rng.range(0.95, 1.05);
  modes(o, sr, 0, [[310, 0.03, 0.25], [820, 0.016, 0.16], [1460, 0.01, 0.1]]);
  noiseLayer(o, sr, rng, { mode: "lp", f: 900, q: 0.8, tau: 0.02, gain: 0.25 });
  // sifflet : bande très étroite plus un fond de sinus, hauteur qui tombe de plus en plus vite
  const fr = (t: number) => p * (2300 - 1500 * (t / dur) ** 1.6) * (1 + 0.012 * Math.sin(TAU * 6.5 * t));
  const swell = (t: number) => Math.min(1, t / 0.12) * (0.35 + 0.65 * (t / dur) ** 1.5) * (t > dur ? Math.exp(-(t - dur) / 0.02) : 1);
  noiseLayer(o, sr, rng, { at: 0.03, f: fr, q: 28, attack: 0.001, hold: dur, tau: 0.02, gain: 0.9, am: swell });
  toneLayer(o, sr, { at: 0.03, f0: 0, fn: fr, attack: 0.001, hold: dur, tau: 0.02, gain: 0.3, am: swell });
  noiseLayer(o, sr, rng, { at: 0.03, f: 1500, q: 0.6, attack: 0.1, hold: dur * 0.8, tau: 0.05, gain: 0.08 });
  return finish(o, sr);
}

/** Torpille : chasse d'air comprimé, eau qui se referme, chapelet de bulles. */
function torpedo(sr: number, rng: Rng): Float32Array {
  const o = new Float32Array(Math.ceil(1.25 * sr));
  const p = rng.range(0.93, 1.07);
  toneLayer(o, sr, { f0: 150 * p, f1: 48, tauPitch: 0.05, tau: 0.13, gain: 1.2 });
  noiseLayer(o, sr, rng, { mode: "lp", f: (t) => 250 + 900 * Math.exp(-t / 0.05), q: 0.9, tau: 0.09, gain: 0.9 });
  saturate(o, 2.2);
  // eau : souffle étouffé
  noiseLayer(o, sr, rng, { mode: "lp", f: (t) => 500 + 1700 * Math.exp(-t / 0.25), q: 0.8, color: "pink", attack: 0.03, tau: 0.3, gain: 0.3 });
  grains(o, sr, rng, { at: 0.05, dur: 0.95, rate: 34, tauRate: 0.5, lo: 320 * p, hi: 1500 * p, tau: 0.012, gain: 0.3, glide: 9 });
  // hélice
  toneLayer(o, sr, { at: 0.08, f0: 46 * p, f1: 58 * p, tauPitch: 0.3, shape: "saw", attack: 0.1, hold: 0.3, tau: 0.25, gain: 0.07 });
  return finish(svf(o, sr, "lp", 3200, 0.7), sr);
}

/** Frappe orbitale : le ciel claque, une colonne d'énergie gronde et grésille, puis retombe. */
function orbital(sr: number, rng: Rng): Float32Array {
  const o = new Float32Array(Math.ceil(3 * sr));
  crack(o, sr, rng, { gain: 1, width: 0.001, fc: 3000, tau: 0.012 });
  noiseLayer(o, sr, rng, { f: (t) => 250 + 11000 * Math.exp(-t / 0.07), q: 1.2, tau: 0.16, gain: 1 });
  toneLayer(o, sr, { f0: 110, f1: 34, tauPitch: 0.08, tau: 0.45, gain: 1.4 });
  saturate(o, 3);
  const body = new Float32Array(o.length);
  const trem = (t: number) => (0.7 + 0.3 * Math.sin(TAU * 17 * t)) * Math.min(1, t / 0.25);
  for (const [f, g] of [[55, 0.5], [55.6, 0.5], [82.7, 0.35], [110.9, 0.3]] as [number, number][])
    toneLayer(body, sr, { at: 0.03, f0: f, shape: "saw", attack: 0.25, hold: 1.1, tau: 0.3, gain: g, am: trem });
  const cut = svf(body, sr, "lp", (t) => 500 + 2600 * Math.min(1, t / 0.9), 1.4);
  saturate(cut, 3.5);
  for (let i = 0; i < o.length; i++) o[i] += cut[i] * 0.75;
  toneLayer(o, sr, { at: 0.03, f0: 41, attack: 0.2, hold: 1.2, tau: 0.35, gain: 0.7, am: (t) => 0.75 + 0.25 * Math.sin(TAU * 8.5 * t) });
  // grésillement de l'air ionisé
  const w = wobble(rng, 55, 3);
  noiseLayer(o, sr, rng, { at: 0.03, mode: "hp", f: 3800, q: 0.7, attack: 0.15, hold: 1.2, tau: 0.25, gain: 0.16, am: (t) => 0.3 + 1.2 * w(t) ** 2 });
  grains(o, sr, rng, { at: 0.1, dur: 1.6, rate: 90, tauRate: 1.4, lo: 2500, hi: 7500, tau: 0.002, gain: 0.3 });
  // grondement final
  const w2 = wobble(rng, 7, 3);
  noiseLayer(o, sr, rng, { at: 1.1, mode: "lp", f: 170, q: 0.7, color: "brown", attack: 0.25, tau: 0.5, gain: 0.35, am: (t) => 0.5 + w2(t) });
  return finish(o, sr);
}

/** Plasma : claquement, corps rond dont la hauteur plonge (modulation de fréquence), énergie qui grésille. */
function plasma(sr: number, rng: Rng, size: number): Float32Array {
  const u = clamp01((size - 1) / 0.45);
  const o = new Float32Array(Math.ceil((0.75 + 0.5 * u) * sr));
  const p = (1.2 - 0.45 * u) * rng.range(0.95, 1.05);
  noiseLayer(o, sr, rng, { mode: "hp", f: 3500, q: 0.7, attack: 0.0003, tau: 0.004, gain: 0.7 });
  // deux porteuses légèrement désaccordées : indice de modulation fort au départ (éclat métallique), nul ensuite
  for (const d of [0.994, 1.006])
    toneLayer(o, sr, { f0: 340 * p * d, f1: 62 * p, tauPitch: 0.05 + 0.03 * u, tau: 0.13 + 0.1 * u, gain: 0.6, fmRatio: 1.51, fmIndex: 5.5, fmTau: 0.045 + 0.03 * u });
  toneLayer(o, sr, { f0: 105 * p, f1: 44, tauPitch: 0.06, tau: 0.14 + 0.1 * u, gain: 0.9 });
  // énergie : bande qui retombe, rendue rugueuse par une modulation en anneau
  noiseLayer(o, sr, rng, { f: (t) => (800 + 4800 * Math.exp(-t / 0.045)) * p, q: 2.2, tau: 0.09 + 0.05 * u, gain: 0.55, am: (t) => 0.55 + 0.45 * Math.sin(TAU * 96 * t) });
  saturate(o, 2.4 + u);
  // grésillement qui s'éteint
  const w = wobble(rng, 70, 2);
  noiseLayer(o, sr, rng, { at: 0.02, mode: "hp", f: 3200, q: 0.7, attack: 0.01, tau: 0.16 + 0.12 * u, gain: 0.07, am: (t) => 0.2 + 1.4 * w(t) ** 2 });
  noiseLayer(o, sr, rng, { mode: "lp", f: (t) => 300 + 1500 * Math.exp(-t / 0.1), q: 0.7, color: "pink", attack: 0.004, tau: 0.14 + 0.1 * u, gain: 0.07 });
  return finish(o, sr);
}

/** Canon à ions, impulsion électromagnétique : arc électrique qui claque, bourdonne par à-coups et crépite. */
function ion(sr: number, rng: Rng, size: number): Float32Array {
  const u = clamp01((size - 1.1) / 0.5);
  const life = 0.22 + 0.25 * u;
  const o = new Float32Array(Math.ceil((life * 4 + 0.4) * sr));
  crack(o, sr, rng, { gain: 0.9, width: 0.0005, fc: 4200, tau: 0.004 });
  // arc : deux dents de scie non harmoniques, filtre qui saute, coupures aléatoires
  const arc = new Float32Array(o.length);
  for (const f of [97, 146.5, 291]) toneLayer(arc, sr, { f0: f * rng.range(0.97, 1.03), shape: "saw", attack: 0.002, hold: life, tau: life * 0.7, gain: 0.5 });
  const hop = 1 / rng.range(45, 75);
  const steps = Math.ceil(o.length / sr / hop) + 2;
  const cutoff = new Float32Array(steps);
  const gate = new Float32Array(steps);
  for (let i = 0; i < steps; i++) {
    cutoff[i] = 700 * Math.pow(7, rng.next());
    gate[i] = rng.next() < 0.22 ? 0.12 : 0.5 + 0.5 * rng.next();
  }
  const zz = svf(arc, sr, "bp", (t) => cutoff[Math.min(steps - 1, Math.floor(t / hop))], 2.5);
  for (let i = 0; i < o.length; i++) o[i] += zz[i] * 2.2 * gate[Math.min(steps - 1, Math.floor(i / sr / hop))];
  toneLayer(o, sr, { f0: 82 - 20 * u, f1: 38, tauPitch: 0.08, tau: 0.16 + 0.2 * u, gain: 0.7 + 0.5 * u });
  saturate(o, 3);
  grains(o, sr, rng, { at: 0.005, dur: life * 3.5, rate: 160, tauRate: life * 1.2, lo: 2800, hi: 9000, tau: 0.0012, gain: 0.5 });
  // grosse impulsion : sirène qui s'effondre
  if (u > 0.4) toneLayer(o, sr, { f0: 1100, f1: 70, tauPitch: 0.3, attack: 0.01, tau: 0.45, gain: 0.16, am: (t) => 0.6 + 0.4 * Math.sin(TAU * 31 * t) });
  return finish(o, sr);
}

/**
 * Trait d'énergie dispersé : une impulsion et une bouffée de bruit de `burst` secondes, étalées de
 * l'aigu au grave par `stages` passe-tout de coefficient `a`, accentuées autour de `tone`. Crête à 1.
 */
function chirp(sr: number, rng: Rng, len: number, a: number, stages: number, tone: number, burst = 0.0025): Float32Array {
  const x = new Float32Array(Math.ceil(len * sr));
  x[0] = 1;
  x[1] = -0.5;
  const nb = Math.floor(burst * sr);
  for (let i = 2; i < nb; i++) x[i] = rng.bi() * 0.8 * (1 - i / nb);
  disperse(x, a, Math.round((stages * sr) / 44100));
  const hp = svf(x, sr, "hp", 240, 0.7);
  const bp = svf(hp, sr, "bp", tone, 0.8);
  for (let i = 0; i < x.length; i++) x[i] = hp[i] * 0.5 + bp[i];
  const k = 1 / Math.max(1e-6, peak(x));
  for (let i = 0; i < x.length; i++) x[i] *= k;
  return x;
}

/** Ajoute `x` à `o`, avec une décroissance de constante `tau` (s). */
function addDecay(o: Float32Array, x: Float32Array, sr: number, gain: number, tau: number): void {
  const kd = Math.exp(-1 / (tau * sr));
  let e = gain;
  for (let i = 0; i < x.length && i < o.length; i++) {
    o[i] += x[i] * e;
    e *= kd;
  }
}

/** Blaster : deux glissements dispersés (le câble frappé), souffle résonant qui les suit, appui grave, étincelle. */
function blaster(sr: number, rng: Rng, size: number, rapid: boolean): Float32Array {
  const u = clamp01((size - 0.8) / 0.5);
  const sweep = (rapid ? 0.065 : 0.09) + 0.1 * u;
  const o = new Float32Array(Math.ceil((sweep * 2.4 + 0.3 + 0.25 * u) * sr));
  const p = (1.25 - 0.5 * u) * rng.range(0.94, 1.06);
  // retard des graves par étage : 13,3 échantillons à a = -0,86 ; 9 à a = -0,8
  addDecay(o, chirp(sr, rng, sweep * 1.7, -0.86, (sweep * 44100) / 13.3, 2000 * p), sr, 1, sweep * 0.8);
  addDecay(o, chirp(sr, rng, sweep * 1.4, -0.8, (sweep * 0.75 * 44100) / 9, 3300 * p), sr, 0.6, sweep * 0.6);
  // souffle résonant qui suit le glissement, corps en modulation de fréquence
  noiseLayer(o, sr, rng, { f: (t) => (260 + 3600 * Math.exp(-t / (sweep * 0.42))) * p, q: 7, attack: 0.001, tau: sweep * 0.6, gain: 0.45 });
  toneLayer(o, sr, { f0: 1500 * p, f1: 150 * p, tauPitch: sweep * 0.4, attack: 0.0015, tau: sweep * 0.5, gain: 0.28, fmRatio: 2.01, fmIndex: 2.4, fmTau: sweep * 0.4 });
  toneLayer(o, sr, { f0: 210 * p, f1: 72, tauPitch: 0.016, tau: 0.035 + 0.05 * u, gain: 0.5 + 0.5 * u });
  noiseLayer(o, sr, rng, { mode: "hp", f: 5200, q: 0.7, attack: 0.0003, tau: 0.006, gain: 0.3 });
  saturate(o, 2 + 1.2 * u);
  // le câble résonne : peigne court, puis deux partiels qui s'éteignent
  reflect(o, sr, 0.00046 / p, 0.3);
  const m = rng.range(0.92, 1.1);
  modes(o, sr, 0.002, [[3150 * m, 0.03 + 0.02 * u, 0.045], [4720 * m, 0.02, 0.03]], 0.6);
  noiseLayer(o, sr, rng, { mode: "lp", f: (t) => 400 + 2500 * p * Math.exp(-t / 0.06), q: 0.7, color: "pink", attack: 0.004, tau: 0.05 + 0.1 * u, gain: 0.05 });
  return finish(o, sr);
}

/** Trait de laser lourd (croiseur) : glissement dispersé long et grave, souffle résonant, coup sourd. */
function laserBolt(sr: number, rng: Rng): Float32Array {
  const o = new Float32Array(Math.ceil(0.95 * sr));
  const p = rng.range(0.94, 1.06);
  addDecay(o, chirp(sr, rng, 0.34, -0.9, (0.2 * 44100) / 19, 1300 * p, 0.004), sr, 1, 0.16);
  addDecay(o, chirp(sr, rng, 0.25, -0.84, (0.14 * 44100) / 11.5, 2400 * p), sr, 0.6, 0.11);
  noiseLayer(o, sr, rng, { f: (t) => (200 + 3000 * Math.exp(-t / 0.085)) * p, q: 6, attack: 0.001, tau: 0.13, gain: 0.5 });
  for (const d of [0.992, 1.008]) toneLayer(o, sr, { f0: 1100 * p * d, f1: 110 * p, tauPitch: 0.08, attack: 0.002, tau: 0.12, gain: 0.2, fmRatio: 1.5, fmIndex: 3, fmTau: 0.07 });
  toneLayer(o, sr, { f0: 150 * p, f1: 46, tauPitch: 0.03, tau: 0.13, gain: 1.1 });
  crack(o, sr, rng, { gain: 0.6, width: 0.0006, fc: 4500, tau: 0.006 });
  saturate(o, 3);
  reflect(o, sr, 0.0007, 0.3);
  noiseLayer(o, sr, rng, { mode: "hp", f: 3000, q: 0.7, attack: 0.01, tau: 0.12, gain: 0.05 });
  noiseLayer(o, sr, rng, { mode: "lp", f: (t) => 350 + 2000 * Math.exp(-t / 0.1), q: 0.7, color: "pink", attack: 0.005, tau: 0.16, gain: 0.07 });
  return finish(o, sr);
}

/**
 * Rayon laser tenu `dur` secondes : amorçage, puis un faisceau qui brûle. Trois dents de scie dont la
 * hauteur tremble (les raies deviennent des bandes : un grésillement électrique, pas un accord d'orgue),
 * saturées puis filtrées dans l'aigu, hachées à 71 Hz ; bourdon du générateur, air qui crépite, extinction.
 */
function laserBeam(sr: number, rng: Rng, dur: number): Float32Array {
  const o = new Float32Array(Math.ceil((dur + 0.45) * sr));
  const p = rng.range(0.96, 1.04);
  const rel = 0.09;
  const beam = new Float32Array(o.length);
  const rise = (t: number) => 1 + 0.05 * Math.min(1, t / dur);
  for (const [f, g] of [[196, 0.5], [293.2, 0.4], [393.5, 0.35]] as [number, number][]) {
    const j = wobble(rng, 190, dur + 1);
    toneLayer(beam, sr, { f0: 0, fn: (t) => f * p * rise(t) * (0.965 + 0.07 * j(t)), shape: "saw", attack: 0.03, hold: dur, tau: rel, gain: g });
  }
  saturate(beam, 5);
  const w = wobble(rng, 23, dur + 1);
  const sear = svf(beam, sr, "bp", (t) => 2300 + 1100 * w(t), 0.7);
  const flick = wobble(rng, 31, dur + 1);
  const chop = (t: number) => (0.55 + 0.45 * Math.sin(TAU * 71 * t + 2.5 * Math.sin(TAU * 5.3 * t))) * (0.7 + 0.5 * flick(t));
  for (let i = 0; i < o.length; i++) o[i] += (sear[i] * 2.2 + beam[i] * 0.12) * chop(i / sr);
  // bourdon du générateur
  const hum = new Float32Array(o.length);
  toneLayer(hum, sr, { f0: 98 * p, shape: "saw", attack: 0.04, hold: dur, tau: rel, gain: 1 });
  const hl = svf(hum, sr, "lp", 320, 0.8);
  for (let i = 0; i < o.length; i++) o[i] += hl[i] * 0.35;
  saturate(o, 1.8);
  // air qui brûle : souffle aigu instable, crépitements
  const w2 = wobble(rng, 48, dur + 1);
  noiseLayer(o, sr, rng, { mode: "hp", f: 4800, q: 0.7, attack: 0.03, hold: dur, tau: rel, gain: 0.16, am: (t) => 0.3 + 1.2 * w2(t) ** 2 });
  grains(o, sr, rng, { at: 0.02, dur, rate: 60, tauRate: dur * 3, lo: 3000, hi: 8000, tau: 0.0015, gain: 0.2 });
  // amorçage : claquement et glissement bref
  const start = new Float32Array(Math.ceil(0.3 * sr));
  crack(start, sr, rng, { gain: 0.8, width: 0.0005, fc: 4000, tau: 0.005 });
  addDecay(start, chirp(sr, rng, 0.2, -0.86, (0.1 * 44100) / 13.3, 2200 * p), sr, 0.9, 0.08);
  toneLayer(start, sr, { f0: 160, f1: 60, tauPitch: 0.02, tau: 0.06, gain: 0.8 });
  saturate(start, 2.5);
  for (let i = 0; i < start.length; i++) o[i] = o[i] * 0.8 + start[i] * 0.75;
  // extinction : le bourdon retombe
  toneLayer(o, sr, { at: dur + 0.02, f0: 240 * p, f1: 50, tauPitch: 0.08, shape: "saw", attack: 0.01, tau: 0.09, gain: 0.12 });
  return finish(o, sr);
}

/** Souffle de feu tenu `dur` secondes : embrasement, rugissement turbulent, crépitements. */
function flame(sr: number, rng: Rng, dur: number): Float32Array {
  const o = new Float32Array(Math.ceil((dur + 0.9) * sr));
  const rel = 0.22;
  // embrasement
  toneLayer(o, sr, { f0: 130, f1: 45, tauPitch: 0.06, attack: 0.012, tau: 0.16, gain: 0.9 });
  noiseLayer(o, sr, rng, { mode: "lp", f: (t) => 300 + 1400 * Math.exp(-t / 0.08), q: 0.8, attack: 0.012, tau: 0.12, gain: 0.8 });
  const w1 = wobble(rng, 13, dur + 2);
  const w2 = wobble(rng, 47, dur + 2);
  const turb = (t: number) => (0.5 + 0.8 * w1(t)) * (0.7 + 0.5 * w2(t));
  noiseLayer(o, sr, rng, { f: (t) => 380 + 260 * w1(t), q: 0.55, color: "pink", attack: 0.1, hold: dur, tau: rel, gain: 0.75, am: turb });
  noiseLayer(o, sr, rng, { mode: "lp", f: 140, q: 0.7, color: "brown", attack: 0.12, hold: dur, tau: rel * 1.3, gain: 0.5, am: turb });
  noiseLayer(o, sr, rng, { f: (t) => 1900 + 900 * w2(t), q: 0.8, attack: 0.08, hold: dur, tau: rel * 0.7, gain: 0.2, am: (t) => 0.3 + w2(t) });
  saturate(o, 2);
  grains(o, sr, rng, { at: 0.05, dur: dur + 0.2, rate: 55, tauRate: dur * 4, lo: 1500, hi: 6000, tau: 0.002, gain: 0.22 });
  return finish(o, sr);
}

/** Canon de rail : montée de charge très brève, claquement supersonique, rail qui sonne, sifflement du sillage. */
function rail(sr: number, rng: Rng): Float32Array {
  const o = new Float32Array(Math.ceil(1.7 * sr));
  const p = rng.range(0.95, 1.05);
  const t0 = 0.045;
  toneLayer(o, sr, { f0: 0, fn: (t) => 300 * Math.pow(12, Math.min(1, t / t0)), shape: "saw", attack: t0, tau: 0.004, gain: 0.22 });
  const shot = new Float32Array(o.length);
  crack(shot, sr, rng, { at: t0, gain: 1.3, width: 0.0005, fc: 4500, tau: 0.007 });
  const bands: [number, number, number][] = [[240, 1.9, 0.7], [520, 1.4, 0.8], [1100, 1, 0.9], [2300, 0.75, 0.95], [4800, 0.5, 0.85], [9500, 0.32, 0.6]];
  for (const [f, t, g] of bands) noiseLayer(shot, sr, rng, { at: t0, f: f * p, q: 1.1, tau: 0.034 * t, gain: g });
  toneLayer(shot, sr, { at: t0, f0: 135 * p, f1: 40, tauPitch: 0.035, tau: 0.2, gain: 1.5 });
  saturate(shot, 4);
  for (let i = 0; i < o.length; i++) o[i] += shot[i];
  reflect(o, sr, 0.0017, -0.3);
  // rail : partiels non harmoniques dont la hauteur fléchit
  const f = 1180 * p;
  modes(o, sr, t0 + 0.003, [[f, 0.3, 0.1], [f * 2.32, 0.2, 0.07], [f * 3.86, 0.13, 0.05], [f * 5.13, 0.08, 0.04]], 0.08);
  // sillage : bande étroite qui retombe
  noiseLayer(o, sr, rng, { at: t0, f: (t) => 1700 + 8500 * Math.exp(-t / 0.11), q: 9, attack: 0.004, tau: 0.2, gain: 0.16 });
  grains(o, sr, rng, { at: t0 + 0.01, dur: 0.5, rate: 110, tauRate: 0.2, lo: 3000, hi: 9000, tau: 0.0012, gain: 0.25 });
  noiseLayer(o, sr, rng, { at: t0, mode: "lp", f: 140, q: 0.7, color: "brown", attack: 0.03, tau: 0.35, gain: 0.2 });
  noiseLayer(o, sr, rng, { at: t0, mode: "lp", f: (t) => 400 + 3000 * Math.exp(-t / 0.12), q: 0.7, color: "pink", attack: 0.006, tau: 0.25, gain: 0.09 });
  return finish(o, sr);
}

/** Morsure : grognement bref (source rauque, formants), mâchoires qui claquent, craquement. */
function bite(sr: number, rng: Rng, size: number): Float32Array {
  const u = clamp01((size - 0.85) / 0.4);
  const o = new Float32Array(Math.ceil((0.4 + 0.2 * u) * sr));
  const f0 = (165 - 85 * u) * rng.range(0.9, 1.12);
  const src = new Float32Array(o.length);
  const w = wobble(rng, 60, 1);
  toneLayer(src, sr, { f0: 0, fn: (t) => f0 * (1.25 - 0.5 * Math.min(1, t / 0.12)) * (0.94 + 0.12 * w(t)), shape: "saw", attack: 0.012, hold: 0.03 + 0.03 * u, tau: 0.035 + 0.03 * u, gain: 1 });
  noiseLayer(src, sr, rng, { mode: "lp", f: 2500, q: 0.7, attack: 0.01, hold: 0.03, tau: 0.04, gain: 0.35 });
  for (const [f, q, g] of [[620, 5, 1], [1150, 6, 0.7], [2500, 7, 0.4]] as [number, number, number][]) {
    const y = svf(src, sr, "bp", f * (1.15 - 0.3 * u), q);
    for (let i = 0; i < o.length; i++) o[i] += y[i] * g * 2.2;
  }
  // mâchoires
  for (const [at, g] of [[0.05 + 0.03 * u, 1], [0.075 + 0.045 * u, 0.7]] as [number, number][]) {
    noiseLayer(o, sr, rng, { at, f: (2600 - 900 * u) * rng.range(0.9, 1.1), q: 2, attack: 0.0004, tau: 0.007, gain: g });
    noiseLayer(o, sr, rng, { at, mode: "lp", f: 700, q: 0.8, attack: 0.0006, tau: 0.014, gain: g * 0.6 });
  }
  toneLayer(o, sr, { at: 0.05 + 0.03 * u, f0: 150 - 40 * u, f1: 60, tauPitch: 0.015, tau: 0.04 + 0.03 * u, gain: 0.7 });
  saturate(o, 2.6);
  grains(o, sr, rng, { at: 0.06, dur: 0.12, rate: 140, tauRate: 0.05, lo: 500, hi: 2600, tau: 0.003, gain: 0.3 });
  return finish(o, sr);
}

/** Crachat acide : expulsion rauque, gargouillis, gouttes. */
function spit(sr: number, rng: Rng): Float32Array {
  const o = new Float32Array(Math.ceil(0.6 * sr));
  const p = rng.range(0.92, 1.08);
  noiseLayer(o, sr, rng, { f: (t) => (520 + 1300 * Math.exp(-t / 0.035)) * p, q: 3.2, attack: 0.006, tau: 0.07, gain: 1 });
  noiseLayer(o, sr, rng, { mode: "hp", f: 3000, q: 0.7, attack: 0.004, tau: 0.03, gain: 0.3 });
  toneLayer(o, sr, { f0: 0, fn: (t) => (190 - 90 * Math.min(1, t / 0.15)) * p * (1 + 0.12 * Math.sin(TAU * 38 * t)), shape: "saw", attack: 0.01, tau: 0.07, gain: 0.35 });
  saturate(o, 2);
  grains(o, sr, rng, { at: 0.03, dur: 0.4, rate: 60, tauRate: 0.16, lo: 350 * p, hi: 1300 * p, tau: 0.01, gain: 0.4, glide: 14 });
  return finish(svf(o, sr, "lp", 5500, 0.7), sr);
}

/** Paramètres d'un son de tir, tirés de la définition de l'arme. */
export interface ShotSpec {
  /** famille de projectile (Proj dans sim/src/data.rs) */
  proj: number;
  /** taille de l'arme, 0,7 à 1,8 (voir weaponSize) */
  size: number;
  /** arme à cadence élevée : son plus sec et plus court */
  rapid: boolean;
  /** rayon prolongé : durée en secondes (0 : tir ordinaire) */
  sustain: number;
}

/** Taille d'une arme pour le son, d'après ses dégâts et son rayon d'effet (0,7 à 1,8). */
export function weaponSize(dmg: number, aoe: number): number {
  return Math.max(0.7, Math.min(1.8, 0.55 + Math.log10(Math.max(1, dmg)) * 0.3 + aoe / 1800));
}

/** Son d'une arme : taille arrondie au dixième, pour que des armes voisines partagent leurs tampons. Seuls un rayon
 * (8) et un jet de flammes (10) font un son tenu ; la durée d'une autre arme (câble tendu du grappin du Mâtin) ne
 * s'entend pas. */
export function shotSpec(w: { proj: number; dmg: number; aoe: number; cooldown: number; sustain: number }): ShotSpec {
  const held = w.proj === 8 || w.proj === 10;
  return { proj: w.proj, size: Math.round(weaponSize(w.dmg, w.aoe) * 10) / 10, rapid: w.cooldown <= 12, sustain: held ? w.sustain * 0.05 : 0 };
}

export function specKey(s: ShotSpec): string {
  return `${s.proj}:${s.size}:${s.rapid ? 1 : 0}:${s.sustain}`;
}

/** Calcule le son d'un tir (mono, crête à 0,97). `seed` choisit la variante. */
export function renderShot(s: ShotSpec, seed: number, sr: number): Float32Array {
  const rng = new Rng(seed * 7919 + s.proj * 104729 + Math.round(s.size * 10) * 31 + 17);
  switch (s.proj) {
    case 1:
      return shell(sr, rng, s.size);
    case 2:
      return missile(sr, rng, s.size, s.rapid);
    case 3:
      return bomb(sr, rng, s.size);
    case 4:
      return torpedo(sr, rng);
    case 5:
      return orbital(sr, rng);
    case 6:
      return plasma(sr, rng, s.size);
    case 7:
      return ion(sr, rng, s.size);
    case 8:
      return s.sustain > 0 ? laserBeam(sr, rng, s.sustain) : laserBolt(sr, rng);
    case 9:
      return blaster(sr, rng, s.size, s.rapid);
    case 10:
      return flame(sr, rng, Math.max(0.6, s.sustain));
    case 11:
      return rail(sr, rng);
    case 12:
      return bite(sr, rng, s.size);
    case 13:
      return spit(sr, rng);
    default:
      return gun(sr, rng, s.size, s.rapid);
  }
}

/** Classes d'explosion : impact sans souffle, puis de la petite explosion à l'arme nucléaire. */
export const BOOM_IMPACT = 0;
export const BOOM_HUGE = 5;
export const BOOM_NUKE = 6;

/** Classe d'une explosion d'après son rayon (cases) et son type (2 : unité expérimentale, 3 : nucléaire). */
export function boomClass(radius: number, kind: number): number {
  if (kind >= 3) return BOOM_NUKE;
  if (kind === 2) return BOOM_HUGE;
  return radius < 0.4 ? BOOM_IMPACT : radius < 1.3 ? 1 : radius < 2.6 ? 2 : radius < 4.5 ? 3 : 4;
}

/** Impact d'un projectile sans souffle : coup mat, terre soulevée, parfois un ricochet. */
function impact(sr: number, rng: Rng): Float32Array {
  const o = new Float32Array(Math.ceil(0.45 * sr));
  const p = rng.range(0.85, 1.2);
  noiseLayer(o, sr, rng, { mode: "lp", f: (t) => 220 + 1500 * p * Math.exp(-t / 0.012), q: 0.9, attack: 0.0005, tau: 0.03, gain: 1 });
  noiseLayer(o, sr, rng, { f: 2600 * p, q: 1.2, attack: 0.0004, tau: 0.008, gain: 0.5 });
  toneLayer(o, sr, { f0: 150 * p, f1: 62, tauPitch: 0.012, tau: 0.04, gain: 0.9 });
  saturate(o, 2.2);
  grains(o, sr, rng, { at: 0.01, dur: 0.2, rate: 90, tauRate: 0.06, lo: 900, hi: 4500, tau: 0.002, gain: 0.25 });
  if (rng.next() < 0.4) {
    // ricochet : sifflement qui file
    const f = rng.range(2600, 4200);
    toneLayer(o, sr, { at: 0.012, f0: f, f1: f * 0.55, tauPitch: 0.12, attack: 0.004, tau: 0.07, gain: 0.12, fmRatio: 0.07, fmIndex: 3, fmTau: 1 });
  }
  return finish(o, sr);
}

/** Explosion de force `e` (0 petite, 1 énorme) : claquement, détonation en bandes, grave qui s'enfonce, débris, grondement. */
function blast(sr: number, rng: Rng, e: number, nuke: boolean): Float32Array {
  const len = nuke ? 7.5 : 1.1 + 3.2 * e;
  const o = new Float32Array(Math.ceil(len * sr));
  const p = (1.15 - 0.5 * e) * rng.range(0.93, 1.07);
  crack(o, sr, rng, { gain: 1, width: 0.0006 + 0.0012 * e, fc: 2600 * p, tau: 0.005 + 0.008 * e });
  const base = 0.075 + 0.24 * e + (nuke ? 0.25 : 0);
  const bands: [number, number, number, number][] = [[70, 2.6, 0.9, 0.012], [140, 2.1, 1, 0.008], [280, 1.6, 1, 0.004], [560, 1.2, 0.9, 0.002], [1100, 0.85, 0.75, 0.001], [2200, 0.55, 0.55, 0.0008], [4400, 0.35, 0.4, 0.0005], [8800, 0.2, 0.25, 0.0004]];
  for (const [f, t, g, a] of bands) noiseLayer(o, sr, rng, { f: f * p, q: 1, attack: a * (1 + 3 * e), tau: base * t * rng.range(0.88, 1.12), gain: g });
  // grave : deux coups dont la hauteur tombe
  toneLayer(o, sr, { f0: (125 - 35 * e) * p, f1: 32, tauPitch: 0.05 + 0.1 * e, tau: 0.22 + 0.7 * e + (nuke ? 0.8 : 0), gain: 1.1 + 0.3 * e });
  toneLayer(o, sr, { f0: 60 * p, f1: 25, tauPitch: 0.12 + 0.2 * e, tau: 0.3 + 0.9 * e + (nuke ? 1.2 : 0), gain: 0.45 + 0.3 * e });
  saturate(o, 3.2 + 2.6 * e);
  reflect(o, sr, rng.range(0.002, 0.005), -0.28);
  // débris qui retombent
  grains(o, sr, rng, { at: 0.03, dur: 0.5 + 1.6 * e, rate: 260, tauRate: 0.14 + 0.45 * e, lo: 700, hi: 5200, tau: 0.0025, gain: 0.3 });
  // grondement qui roule
  const w = wobble(rng, 6 + 5 * (1 - e), len + 1);
  noiseLayer(o, sr, rng, { mode: "lp", f: 180 - 60 * e, q: 0.7, color: "brown", attack: 0.06 + 0.1 * e, tau: 0.3 + 1.1 * e + (nuke ? 1.6 : 0), gain: 0.3 + 0.2 * e, am: (t) => 0.5 + w(t) });
  noiseLayer(o, sr, rng, { mode: "lp", f: (t) => 300 + 2600 * p * Math.exp(-t / (0.12 + 0.3 * e)), q: 0.7, color: "pink", attack: 0.008, tau: 0.22 + 0.6 * e, gain: 0.12 });
  if (e > 0.55 || nuke) {
    // grosse explosion : répliques sourdes
    const n = nuke ? 5 : 2;
    for (let i = 0; i < n; i++) {
      const at = (nuke ? 0.5 : 0.28) + i * rng.range(0.35, 0.7) * (nuke ? 1.4 : 1);
      const g = 0.5 * Math.pow(0.72, i);
      toneLayer(o, sr, { at, f0: rng.range(60, 85), f1: 26, tauPitch: 0.1, attack: 0.03, tau: 0.35 + (nuke ? 0.4 : 0), gain: g });
      noiseLayer(o, sr, rng, { at, mode: "lp", f: 240, q: 0.8, color: "brown", attack: 0.04, tau: 0.3 + (nuke ? 0.4 : 0), gain: g * 0.7 });
    }
  }
  return finish(o, sr);
}

/** Calcule le son d'une explosion de la classe donnée (voir boomClass). `seed` choisit la variante. */
export function renderExplosion(cls: number, seed: number, sr: number): Float32Array {
  const rng = new Rng(seed * 6007 + cls * 9973 + 5);
  if (cls <= BOOM_IMPACT) return impact(sr, rng);
  if (cls >= BOOM_NUKE) return blast(sr, rng, 1, true);
  return blast(sr, rng, [0, 0.05, 0.3, 0.55, 0.78, 1][cls], false);
}

/** Frappe du canon orbital. */
export function renderOrbital(seed: number, sr: number): Float32Array {
  return orbital(sr, new Rng(seed * 3571 + 11));
}

/**
 * Réponse d'un terrain ouvert, en stéréo (énergie totale 1 par canal) : quelques échos francs entre
 * 45 et 400 ms (reliefs, bâtiments), de plus en plus sourds, puis une traîne diffuse qui s'assombrit.
 * Convoluée avec un tir, elle donne la queue d'un coup de feu en extérieur.
 */
export function outdoorImpulse(sr: number, seed = 7): [Float32Array, Float32Array] {
  const len = Math.floor(sr * 2.6);
  const out: Float32Array[] = [];
  for (let ch = 0; ch < 2; ch++) {
    const rng = new Rng(seed + ch * 101);
    const d = new Float32Array(len);
    let t = 0.045 + 0.02 * rng.next();
    for (let k = 0; k < 7; k++) {
      // écho : bouffée de bruit de quelques millisecondes, filtrée plus bas à chaque rebond
      const n = Math.floor((0.002 + 0.0035 * k) * sr);
      const x = new Float32Array(n);
      for (let i = 0; i < n; i++) x[i] = rng.bi() * Math.sin((Math.PI * i) / n) ** 2;
      const y = svf(x, sr, "lp", 5200 * Math.pow(0.68, k), 0.7);
      const g = (0.9 * Math.pow(0.74, k)) / Math.max(1e-6, rms(y)) / Math.sqrt(n);
      const a = Math.floor(t * sr);
      for (let i = 0; i < n && a + i < len; i++) d[a + i] += y[i] * g;
      t += (0.035 + 0.03 * k) * rng.range(0.7, 1.3);
    }
    let lp = 0;
    const a0 = Math.floor(0.03 * sr);
    for (let i = a0; i < len; i++) {
      const tt = (i - a0) / sr;
      const k = 0.62 + 0.36 * (1 - Math.exp(-tt / 0.5));
      lp = lp * k + rng.bi() * (1 - k);
      d[i] += lp * (Math.exp(-tt / 0.38) + 0.22 * Math.exp(-tt / 0.95)) * Math.min(1, tt / 0.04) * 0.09;
    }
    out.push(d);
  }
  let e = 0;
  for (const d of out) for (let i = 0; i < len; i++) e += d[i] * d[i];
  const g = 1 / Math.sqrt(e / 2);
  for (const d of out) for (let i = 0; i < len; i++) d[i] *= g;
  return [out[0], out[1]];
}

/** Mixage d'un son : niveau perçu visé (dB), part envoyée dans l'écho du terrain, nombre de variantes. */
export interface Mix {
  target: number;
  wet: number;
  variants: number;
}

/** Mixage d'un tir d'après sa famille et sa taille : un blaster de robot reste discret, un canon de rail domine. */
export function shotMix(s: ShotSpec): Mix {
  const n = s.sustain > 0 ? 2 : s.rapid ? 4 : 3;
  const up = (from: number, span: number) => clamp01((s.size - from) / span);
  switch (s.proj) {
    case 1:
      return { target: -22, wet: 0.6, variants: 3 };
    case 2:
      return { target: -29 + 4 * up(1, 0.6), wet: 0.3, variants: n };
    case 3:
      return { target: -33, wet: 0.25, variants: 2 };
    case 4:
      return { target: -28, wet: 0.2, variants: 2 };
    case 5:
      return { target: -19, wet: 0.5, variants: 1 };
    case 6:
      return { target: -27 + 2.5 * up(1, 0.45), wet: 0.3, variants: n };
    case 7:
      return { target: -26 + 3 * up(1.1, 0.5), wet: 0.35, variants: 2 };
    case 8:
      return s.sustain > 0 ? { target: -32, wet: 0.2, variants: 2 } : { target: -24, wet: 0.3, variants: 3 };
    case 9:
      return { target: -31 + 5 * up(0.8, 0.5), wet: 0.22, variants: n };
    case 10:
      return { target: -30, wet: 0.2, variants: 2 };
    case 11:
      return { target: -21, wet: 0.6, variants: 2 };
    case 12:
      return { target: -31 + 3 * up(0.85, 0.4), wet: 0.15, variants: 3 };
    case 13:
      return { target: -30, wet: 0.15, variants: 3 };
    default:
      return { target: -29 + 5.5 * up(0.7, 0.9), wet: s.rapid ? 0.35 : 0.5, variants: n };
  }
}

/** Mixage d'une explosion, par classe (voir boomClass). */
export const BOOM_MIX: Mix[] = [
  { target: -35, wet: 0.2, variants: 4 },
  { target: -25, wet: 0.5, variants: 3 },
  { target: -23, wet: 0.55, variants: 3 },
  { target: -21, wet: 0.6, variants: 3 },
  { target: -20, wet: 0.6, variants: 2 },
  { target: -18, wet: 0.65, variants: 2 },
  { target: -16, wet: 0.7, variants: 1 },
];
/** Mixage de la frappe orbitale. */
export const ORBITAL_MIX: Mix = { target: -19, wet: 0.5, variants: 1 };

/**
 * Niveau perçu d'un son (valeur efficace) : pondération proche de la courbe A (deux passe-haut à
 * 250 Hz, un passe-bas à 12 kHz), maximum sur une fenêtre glissante de 125 ms. Sert à régler le
 * volume de chaque tampon pour que les familles d'armes s'équilibrent sans table écrite à la main.
 */
export function loudness(x: Float32Array, sr: number): number {
  const kh = Math.exp((-TAU * 250) / sr);
  const kl = 1 - Math.exp((-TAU * 12000) / sr);
  const w = Math.max(1, Math.floor(0.125 * sr));
  const sq = new Float32Array(x.length);
  let h1 = 0, h2 = 0, x1 = 0, y1 = 0, lp = 0;
  for (let i = 0; i < x.length; i++) {
    h1 = kh * (h1 + x[i] - x1);
    x1 = x[i];
    h2 = kh * (h2 + h1 - y1);
    y1 = h1;
    lp += kl * (h2 - lp);
    sq[i] = lp * lp;
  }
  let sum = 0, best = 0;
  for (let i = 0; i < sq.length; i++) {
    sum += sq[i];
    if (i >= w) sum -= sq[i - w];
    if (sum > best) best = sum;
  }
  return Math.sqrt(best / w);
}

/** Travail de synthèse confié au Worker (audio/synthWorker.ts) : un tir, une explosion, la frappe orbitale ou la réponse du terrain. */
export interface SynthJob {
  id: number;
  kind: "shot" | "boom" | "orbital" | "ir";
  spec?: ShotSpec;
  cls?: number;
  seed: number;
  sr: number;
}
export interface SynthResult {
  id: number;
  chans: Float32Array[];
  /** niveau perçu du son (voir loudness) */
  loud: number;
}

export function runJob(j: SynthJob): SynthResult {
  const chans = j.kind === "shot" ? [renderShot(j.spec!, j.seed, j.sr)] : j.kind === "boom" ? [renderExplosion(j.cls ?? 0, j.seed, j.sr)] : j.kind === "orbital" ? [renderOrbital(j.seed, j.sr)] : outdoorImpulse(j.sr);
  return { id: j.id, chans, loud: j.kind === "ir" ? 1 : loudness(chans[0], j.sr) };
}
