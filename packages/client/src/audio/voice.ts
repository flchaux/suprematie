// Annonces vocales (voix générées avec ElevenLabs, voir assets/audio/LISEZMOI.md), rendues légèrement
// robotiques à la lecture : modulation en anneau discrète, filtre en peigne court (timbre métallique) et
// bande passante resserrée. Une seule annonce à la fois ; une annonce identique déjà en cours est ignorée.
import commandantUrl from "../assets/audio/voix/commandant.mp3?url";
import attaqueUrl from "../assets/audio/voix/attaque.mp3?url";
import rechercheUrl from "../assets/audio/voix/recherche.mp3?url";
import energieUrl from "../assets/audio/voix/energie.mp3?url";
import { audioContext, sfxVolume } from "./sound.ts";

export type Line = "commandant" | "attaque" | "recherche" | "energie";
const URLS: Record<Line, string> = { commandant: commandantUrl, attaque: attaqueUrl, recherche: rechercheUrl, energie: energieUrl };
/** priorité : une annonce plus importante passe devant celles en attente */
const PRIORITY: Record<Line, number> = { commandant: 3, attaque: 2, energie: 1, recherche: 0 };

const buffers = new Map<Line, AudioBuffer>();
let loading: Promise<void> | null = null;
let chain: AudioNode | null = null;
let busyUntil = 0;
let current: Line | null = null;
let pending: Line | null = null;
let enabled = true;

export function setVoiceEnabled(on: boolean): void {
  enabled = on;
}
export function voiceEnabled(): boolean {
  return enabled;
}

async function load(c: AudioContext): Promise<void> {
  await Promise.all(
    (Object.keys(URLS) as Line[]).map(async (k) => {
      const res = await fetch(URLS[k]);
      buffers.set(k, await c.decodeAudioData(await res.arrayBuffer()));
    }),
  );
}

/** Chaîne d'effets « robot » (créée une fois) : sortie = entrée de la chaîne. */
function robotChain(c: AudioContext): AudioNode {
  if (chain) return chain;
  const input = c.createGain();
  // voix directe
  const dry = c.createGain();
  dry.gain.value = 0.75;
  // modulation en anneau à 45 Hz, mélangée faiblement
  const ring = c.createGain();
  ring.gain.value = 0;
  const osc = c.createOscillator();
  osc.frequency.value = 45;
  const depth = c.createGain();
  depth.gain.value = 1;
  osc.connect(depth).connect(ring.gain);
  osc.start();
  const ringMix = c.createGain();
  ringMix.gain.value = 0.3;
  // filtre en peigne : retard de 6 ms rebouclé (résonance métallique)
  const delay = c.createDelay(0.05);
  delay.delayTime.value = 0.006;
  const fb = c.createGain();
  fb.gain.value = 0.38;
  const comb = c.createGain();
  comb.gain.value = 0.35;
  // bande « radio » : coupe les graves et les aigus
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 220;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 5200;
  const out = c.createGain();
  out.gain.value = 1.1;
  input.connect(dry).connect(hp);
  input.connect(ring).connect(ringMix).connect(hp);
  input.connect(delay);
  delay.connect(fb).connect(delay);
  delay.connect(comb).connect(hp);
  hp.connect(lp).connect(out).connect(c.destination);
  chain = input;
  return input;
}

/** Annonce une ligne (sans effet si les annonces sont coupées ou le son à 0). */
export function say(line: Line): void {
  if (!enabled) return;
  const c = audioContext();
  if (!c) return;
  if (!loading) loading = load(c).catch(() => undefined);
  if (!buffers.size) {
    // premier appel : on joue dès que les fichiers sont chargés
    void loading.then(() => say(line));
    return;
  }
  const now = c.currentTime;
  if (now < busyUntil) {
    // une annonce est en cours : garder la plus importante pour la suite (sans répéter la même)
    if (line !== current && (pending === null || PRIORITY[line] > PRIORITY[pending])) pending = line;
    return;
  }
  const buf = buffers.get(line);
  const vol = sfxVolume();
  if (!buf || vol <= 0) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = Math.min(1, 0.4 + vol);
  src.connect(g).connect(robotChain(c));
  src.start(now + 0.02);
  current = line;
  busyUntil = now + buf.duration + 0.35;
  src.onended = () => {
    current = null;
    const next = pending;
    pending = null;
    if (next) setTimeout(() => say(next), 250);
  };
}
