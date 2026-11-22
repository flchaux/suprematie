// Outil d'écoute des sons de combat (audio/synth.ts), sans navigateur.
// Usage : node tools/sounds/render.ts <dossier>
// Écrit dans le dossier :
// - un WAV par arme distincte et par classe d'explosion (son brut, pour l'analyse au spectrogramme) ;
// - liste.txt : durée, niveau perçu et temps de calcul de chacun ;
// - montage.wav : tous les sons à la suite, mixés comme en jeu (niveau visé, écho du terrain, distance,
//   placement gauche-droite, compression du bus), puis une escarmouche ; montage.txt : repères de temps.
import { mkdirSync, writeFileSync } from "node:fs";
import { renderShot, renderExplosion, renderOrbital, outdoorImpulse, shotSpec, specKey, shotMix, loudness, svf, BOOM_MIX, ORBITAL_MIX, Rng, type ShotSpec, type Mix } from "../../packages/client/src/audio/synth.ts";
import data from "../viewer/data.json" with { type: "json" };

const out = process.argv[2] ?? "sons";
const sr = 48000;
mkdirSync(out, { recursive: true });

function wav(path: string, chans: Float32Array[]): void {
  const n = chans[0].length;
  const b = Buffer.alloc(44 + n * chans.length * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n * chans.length * 2, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(chans.length, 22);
  b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * chans.length * 2, 28);
  b.writeUInt16LE(chans.length * 2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(n * chans.length * 2, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < chans.length; c++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, chans[c][i])) * 32767), 44 + (i * chans.length + c) * 2);
  writeFileSync(path, b);
}

/** Transformée de Fourier rapide en place (taille puissance de 2). */
function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) {
    re[i] /= n;
    im[i] /= n;
  }
}

/** Convolution de `x` par la réponse `h`, par blocs (recouvrement-addition). */
function convolve(x: Float32Array, h: Float32Array): Float32Array {
  let n = 1;
  while (n < h.length * 2) n <<= 1;
  const block = n - h.length + 1;
  const hr = new Float64Array(n), hi = new Float64Array(n);
  hr.set(h);
  fft(hr, hi, false);
  const y = new Float32Array(x.length + h.length);
  for (let at = 0; at < x.length; at += block) {
    const re = new Float64Array(n), im = new Float64Array(n);
    re.set(x.subarray(at, Math.min(x.length, at + block)));
    fft(re, im, false);
    for (let i = 0; i < n; i++) {
      const r = re[i] * hr[i] - im[i] * hi[i];
      im[i] = re[i] * hi[i] + im[i] * hr[i];
      re[i] = r;
    }
    fft(re, im, true);
    for (let i = 0; i < n && at + i < y.length; i++) y[at + i] += re[i];
  }
  return y;
}

const PROJ = ["balle", "obus", "missile", "bombe", "torpille", "orbital", "plasma", "ions", "laser", "blaster", "feu", "rail", "morsure", "crachat"];
type Weapon = { proj: number; dmg: number; aoe: number; cooldown: number; sustain: number; salvo: number };
const weapons = data.weapons as Weapon[];

// ---------- Sons bruts ----------
const lines: string[] = [];
const cache = new Map<string, { x: Float32Array; loud: number }>();
function sound(key: string, name: string | null, make: () => Float32Array): { x: Float32Array; loud: number } {
  let s = cache.get(key);
  if (!s) {
    const t0 = performance.now();
    const x = make();
    s = { x, loud: loudness(x, sr) };
    cache.set(key, s);
    if (name) {
      lines.push(`${name.padEnd(40)} ${(x.length / sr).toFixed(2)} s  niveau ${(20 * Math.log10(s.loud)).toFixed(1)} dB  ${(performance.now() - t0).toFixed(0)} ms`);
      wav(`${out}/${name.split(" ")[0]}.wav`, [x]);
    }
  }
  return s;
}
const shot = (spec: ShotSpec, v: number, label = "") =>
  sound(`s${specKey(spec)}#${v}`, v === 0 ? `tir-${String(spec.proj).padStart(2, "0")}-${PROJ[spec.proj]}-${spec.size.toFixed(1)}${spec.rapid ? "r" : ""}${spec.sustain ? "t" + spec.sustain : ""} ${label}` : null, () => renderShot(spec, v, sr));
const boom = (cls: number, v: number) => sound(`b${cls}#${v}`, v === 0 ? `explosion-${cls}` : null, () => renderExplosion(cls, v, sr));
const seen = new Map<string, number[]>();
weapons.forEach((w, i) => {
  const k = specKey(shotSpec(w));
  seen.set(k, [...(seen.get(k) ?? []), i]);
});
for (const [, list] of [...seen].sort((a, b) => weapons[a[1][0]].proj - weapons[b[1][0]].proj)) shot(shotSpec(weapons[list[0]]), 0, `[${list.join(",")}]`);
for (let cls = 0; cls <= 6; cls++) boom(cls, 0);
const orbital = sound("o", "orbital", () => renderOrbital(0, sr));
const ir = outdoorImpulse(sr);
wav(`${out}/ir.wav`, ir);
writeFileSync(`${out}/liste.txt`, lines.join("\n") + "\n");
console.log(lines.join("\n"));

// ---------- Montage mixé comme en jeu ----------
const total = 200 * sr;
const L = new Float32Array(total), R = new Float32Array(total), send = new Float32Array(total);
const rnd = new Rng(42);
let end = 0;
/** Pose un son à l'instant t (s) : même chaîne que voice() dans audio/sound.ts. */
function place(t: number, s: { x: Float32Array; loud: number }, mix: Mix, near = 1, pan = 0, rate = 1): void {
  const gain = Math.pow(10, mix.target / 20) / s.loud;
  let x = s.x;
  if (rate !== 1) {
    const y = new Float32Array(Math.floor(x.length / rate));
    for (let i = 0; i < y.length; i++) {
      const p = i * rate, k = Math.floor(p);
      y[i] = x[k] + ((x[Math.min(x.length - 1, k + 1)] ?? 0) - x[k]) * (p - k);
    }
    x = y;
  }
  if (near < 0.98) x = svf(x, sr, "lp", 650 + 19000 * Math.pow(near, 2.4), 0.5);
  const g = gain * (0.08 + 0.92 * Math.pow(near, 1.5));
  const a = ((Math.max(-0.8, Math.min(0.8, pan * 0.8)) + 1) * Math.PI) / 4;
  const gl = g * Math.cos(a) * Math.SQRT2, gr = g * Math.sin(a) * Math.SQRT2;
  const gs = gain * mix.wet * (0.2 + 0.25 * Math.pow(near, 0.7));
  const at = Math.floor(t * sr);
  for (let i = 0; i < x.length && at + i < total; i++) {
    L[at + i] += x[i] * gl;
    R[at + i] += x[i] * gr;
    send[at + i] += x[i] * gs;
  }
  end = Math.max(end, at + x.length);
}
const fire = (t: number, wi: number, near = 1, pan = 0): void => {
  const w = weapons[wi];
  const spec = shotSpec(w);
  const mix = shotMix(spec);
  const n = spec.sustain > 0 ? 1 : Math.min(5, Math.max(1, w.salvo));
  for (let i = 0; i < n; i++) place(t + i * (spec.proj === 2 ? 0.085 : 0.06) * rnd.range(0.8, 1.2), shot(spec, Math.floor(rnd.next() * mix.variants), ""), mix, near, pan, rnd.range(0.96, 1.04));
};
const explode = (t: number, cls: number, near = 1, pan = 0): void => place(t, boom(cls, Math.floor(rnd.next() * BOOM_MIX[cls].variants)), BOOM_MIX[cls], near, pan, rnd.range(0.94, 1.06));

const marks: string[] = [];
let t = 0.3;
const mark = (label: string) => marks.push(`${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}  ${label}`);
/** `n` tirs de l'arme `wi` espacés de `gap` secondes, puis une pause. */
const burst = (label: string, wi: number, n: number, gap: number, pause = 1.1) => {
  mark(label);
  for (let i = 0; i < n; i++) fire(t + i * gap, wi, 1, (i % 2 ? 0.3 : -0.3) * (n > 1 ? 1 : 0));
  const w = weapons[wi];
  t += (n - 1) * gap + (w.sustain > 0 ? w.sustain * 0.05 : 0) + pause;
};
burst("Blaster de moto (rafale)", 3, 6, 0.25);
burst("Blaster de robot de ligne", 2, 3, 0.5);
burst("Blaster de marcheur d'assaut (salve de 2)", 7, 3, 0.8);
burst("Blaster lourd de marcheur de siège (salve de 2)", 12, 2, 1.3, 1.4);
burst("Mitrailleuse antiaérienne (rafale)", 22, 8, 0.3);
burst("Canon de char léger", 4, 3, 0.9);
burst("Canon du commandant", 0, 2, 1.1, 1.4);
burst("Canons de destroyer (salve de 2)", 24, 2, 1.6, 1.8);
burst("Artillerie", 5, 1, 0, 2);
burst("Artillerie lourde", 14, 1, 0, 2.6);
burst("Missiles antiaériens (rafale)", 26, 4, 0.4, 1.6);
burst("Roquettes à saturation (salve)", 46, 1, 0, 2.6);
burst("Missile tactique", 9, 1, 0, 3);
burst("Bombe larguée", 18, 1, 0, 1.5);
burst("Torpille", 23, 1, 0, 1.6);
burst("Plasma léger (planeur)", 16, 2, 0.9, 1.2);
burst("Plasma (char glisseur)", 8, 2, 1.1, 1.3);
burst("Plasma lourd (commandant renforcé, forteresse)", 1, 2, 1.2, 1.6);
burst("Canon à ions", 10, 1, 0, 1.8);
burst("Impulsion électromagnétique", 51, 1, 0, 2.6);
burst("Rayon laser de l'araignée (3 s)", 27, 1, 0, 1.2);
burst("Laser lourd du croiseur (salve de 2)", 31, 2, 1.3, 1.5);
burst("Souffle de feu du dragon (2,5 s)", 41, 1, 0, 1.4);
burst("Canon de rail", 54, 1, 0, 2.4);
burst("Morsures (petit, moyen, grand)", 55, 2, 0.5, 0.7);
burst("", 56, 2, 0.6, 0.8);
marks.pop();
burst("", 57, 2, 0.7, 1);
marks.pop();
burst("Crachat acide", 58, 2, 0.8, 1.2);
mark("Impacts de projectiles");
for (let i = 0; i < 6; i++) explode(t + i * 0.35, 0, 1, i % 2 ? 0.4 : -0.4);
t += 3;
for (let cls = 1; cls <= 6; cls++) {
  mark(["", "Petite explosion", "Explosion moyenne", "Grosse explosion", "Très grosse explosion", "Explosion d'une expérimentale", "Explosion nucléaire"][cls]);
  explode(t, cls);
  t += cache.get(`b${cls}#0`) ? 0 : 0;
  t += [0, 2.2, 3, 3.8, 4.6, 5.5, 9][cls];
}
mark("Frappe orbitale");
place(t, orbital, ORBITAL_MIX);
t += 4.5;
mark("Le même canon de près, puis de plus en plus loin");
[1, 0.7, 0.45, 0.25, 0.1].forEach((near, i) => fire(t + i * 1.5, 0, near, 0));
t += 9;
mark("La même explosion de près, puis de plus en plus loin");
[1, 0.6, 0.3, 0.1].forEach((near, i) => explode(t + i * 2.6, 2, near, 0));
t += 12;
mark("Escarmouche (robots, chars, artillerie, avions)");
{
  const t0 = t;
  const who: [number, number, number, number][] = [
    // arme, cadence (s), proximité, gauche-droite
    [2, 1.0, 0.9, -0.5], [2, 1.0, 0.8, -0.2], [2, 1.0, 0.85, 0.1], [3, 0.5, 0.7, 0.5], [3, 0.5, 0.75, 0.3],
    [4, 1.5, 0.9, -0.6], [4, 1.5, 0.6, 0.6], [7, 0.8, 0.8, 0.4], [8, 2.0, 0.7, -0.3], [13, 1.5, 0.9, 0.2],
    [33, 1.0, 0.5, 0.7], [5, 4.0, 0.4, -0.7], [15, 0.4, 0.6, 0], [35, 2.0, 0.55, 0.6],
  ];
  for (const [wi, cd, near, pan] of who) {
    for (let s = rnd.range(0, cd); s < 18; s += cd * rnd.range(0.9, 1.15)) {
      fire(t0 + s, wi, near * rnd.range(0.85, 1), pan);
      const w = weapons[wi];
      // impact un peu plus tard, de l'autre côté
      explode(t0 + s + rnd.range(0.25, 0.6), w.aoe >= 256 ? 1 : 0, near * rnd.range(0.7, 0.95), -pan * 0.8);
    }
  }
  for (const s of [5.5, 9.2, 13.4, 16]) explode(t0 + s, 2, rnd.range(0.6, 0.9), rnd.range(-0.6, 0.6));
  explode(t0 + 17.2, 3, 0.85, 0.1);
  t += 22;
}
const n = Math.min(total, end + 3 * sr);
const wetL = convolve(send.subarray(0, n), ir[0]);
const wetR = convolve(send.subarray(0, n), ir[1]);
// bus : compresseur (seuil -16 dB, rapport 5, attaque 2 ms, relâchement 140 ms), gain de rattrapage, écrêtage doux
const oL = new Float32Array(n), oR = new Float32Array(n);
const ka = Math.exp(-1 / (0.002 * sr)), kr = Math.exp(-1 / (0.14 * sr));
let envl = 0;
for (let i = 0; i < n; i++) {
  const l = L[i] + wetL[i], r = R[i] + wetR[i];
  const p = Math.max(Math.abs(l), Math.abs(r));
  envl = p > envl ? p + (envl - p) * ka : p + (envl - p) * kr;
  const db = 20 * Math.log10(envl + 1e-9);
  const over = db + 16;
  const red = over <= -5 ? 0 : over >= 5 ? over * (1 - 1 / 5) : ((over + 5) ** 2 / 20) * (1 - 1 / 5);
  const g = Math.pow(10, (7.7 - red) / 20);
  // écrêtage doux du bus (voir buildBus dans audio/sound.ts)
  oL[i] = Math.tanh(l * g * 1.1) / Math.tanh(2.2);
  oR[i] = Math.tanh(r * g * 1.1) / Math.tanh(2.2);
}
let pk = 0;
for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(oL[i]), Math.abs(oR[i]));
console.log(`montage : ${(n / sr).toFixed(0)} s, crête ${(20 * Math.log10(pk)).toFixed(1)} dB`);
wav(`${out}/montage.wav`, [oL, oR]);
writeFileSync(`${out}/montage.txt`, marks.join("\n") + "\n");
console.log(marks.join("\n"));
