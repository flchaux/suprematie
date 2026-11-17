// Musique de fond (générée avec ElevenLabs Music, voir src/assets/audio/LISEZMOI.md), jouée en boucle :
// chaque passage se termine en fondu enchaîné avec le suivant, pour que la reprise ne s'entende pas.
// Elle démarre au premier geste du joueur (les navigateurs bloquent le son avant toute interaction).
import trackUrl from "../assets/audio/theme.mp3?url";
import { audioContext } from "./sound.ts";

/** Durée du fondu enchaîné entre deux passages (secondes). */
const CROSSFADE = 6;
/** Fondu d'entrée au démarrage (secondes). */
const FADE_IN = 4;

let volume = 0.35;
let out: GainNode | null = null;
let buffer: AudioBuffer | null = null;
let loading: Promise<void> | null = null;
let playing = false;
let timer = 0;

export function musicVolume(): number {
  return volume;
}

/** La musique joue-t-elle ? (tests automatisés) */
export function musicPlaying(): boolean {
  return playing;
}

/** Volume de la musique (0..1) ; à 0 elle est muette (et ne démarre pas si elle n'a pas commencé). */
export function setMusicVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v));
  const c = out?.context;
  if (out && c) out.gain.setTargetAtTime(volume, c.currentTime, 0.15);
  if (volume > 0) void startMusic();
}

async function load(c: AudioContext): Promise<void> {
  const res = await fetch(trackUrl);
  buffer = await c.decodeAudioData(await res.arrayBuffer());
}

/** Lance la musique (sans effet si elle joue déjà ou si le volume est nul). */
export async function startMusic(): Promise<void> {
  if (playing || volume <= 0) return;
  const c = audioContext();
  if (!c) return;
  if (!buffer) {
    loading ??= load(c).catch(() => {
      loading = null;
    });
    await loading;
    if (!buffer || playing) return;
  }
  playing = true;
  out = c.createGain();
  out.gain.value = volume;
  out.connect(c.destination);
  schedule(c, c.currentTime + 0.05, FADE_IN);
}

/** Programme un passage à l'instant `at`, avec un fondu d'entrée, puis le suivant avant sa fin. */
function schedule(c: AudioContext, at: number, fadeIn: number): void {
  if (!buffer || !out) return;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const g = c.createGain();
  const end = at + buffer.duration;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(1, at + fadeIn);
  g.gain.setValueAtTime(1, end - CROSSFADE);
  g.gain.linearRampToValueAtTime(0.0001, end);
  src.connect(g).connect(out);
  src.start(at);
  src.stop(end + 0.1);
  // le passage suivant commence pendant le fondu de sortie de celui-ci
  const next = end - CROSSFADE;
  clearTimeout(timer);
  timer = window.setTimeout(() => schedule(c, next, CROSSFADE), Math.max(0, (next - c.currentTime - 2) * 1000));
}

/** Démarre la musique au premier clic ou à la première touche. */
export function initMusic(stored: number): void {
  volume = stored;
  const go = () => {
    void startMusic();
    removeEventListener("pointerdown", go);
    removeEventListener("keydown", go);
  };
  addEventListener("pointerdown", go);
  addEventListener("keydown", go);
}
