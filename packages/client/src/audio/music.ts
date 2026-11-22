// Musique de fond (générée avec ElevenLabs Music, voir src/assets/audio/LISEZMOI.md) : les morceaux alternent,
// chacun se termine en fondu enchaîné avec le suivant, pour que le passage de l'un à l'autre ne s'entende pas.
// Elle démarre au premier geste du joueur (les navigateurs bloquent le son avant toute interaction).
// Seul le premier morceau est attendu au démarrage ; les autres se téléchargent ensuite. Un morceau n'est décodé
// que peu avant d'entrer (un morceau décodé pèse une cinquantaine de Mo), et libéré quand il a fini.
import theme1Url from "../assets/audio/theme.mp3?url";
import theme2Url from "../assets/audio/theme2.mp3?url";
import { audioContext } from "./sound.ts";

/** Morceaux, dans leur ordre de passage. */
const TRACKS = [theme1Url, theme2Url];
/** Durée du fondu enchaîné entre deux morceaux (secondes). */
const CROSSFADE = 6;
/** Fondu d'entrée au démarrage (secondes). */
const FADE_IN = 4;
/** Le morceau suivant est décodé ce délai avant son entrée (secondes). */
const PREPARE = 20;

interface Pass {
  track: number;
  buffer: AudioBuffer;
  src: AudioBufferSourceNode;
  gain: GainNode;
}

let volume = 0.35;
let out: GainNode | null = null;
/** Fichiers compressés, téléchargés une fois chacun (indexés comme TRACKS). */
const encoded: (Promise<ArrayBuffer | null> | undefined)[] = [];
let starting: Promise<void> | null = null;
let playing = false;
let timer = 0;
/** Dernier passage programmé. */
let cur: Pass | null = null;
/** Nombre de passages programmés depuis le démarrage. */
let passes = 0;

export function musicVolume(): number {
  return volume;
}

/** La musique joue-t-elle ? (tests automatisés) */
export function musicPlaying(): boolean {
  return playing;
}

/** Morceau programmé en dernier, sa durée, passages depuis le démarrage, morceaux demandés au serveur (tests). */
export function musicState(): { playing: boolean; track: number; duration: number; passes: number; requested: number; tracks: number } {
  const requested = encoded.filter(Boolean).length;
  return { playing, track: cur?.track ?? -1, duration: cur?.buffer.duration ?? 0, passes, requested, tracks: TRACKS.length };
}

/** Volume de la musique (0..1) ; à 0 elle est muette (et ne démarre pas si elle n'a pas commencé). */
export function setMusicVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v));
  const c = out?.context;
  if (out && c) out.gain.setTargetAtTime(volume, c.currentTime, 0.15);
  if (volume > 0) void startMusic();
}

function fetchTrack(i: number): Promise<ArrayBuffer | null> {
  const p = (encoded[i] ??= fetch(TRACKS[i])
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .catch(() => null));
  // un échec sera retenté au prochain besoin
  void p.then((b) => {
    if (!b && encoded[i] === p) encoded[i] = undefined;
  });
  return p;
}

async function decode(c: AudioContext, i: number): Promise<AudioBuffer | null> {
  const bytes = await fetchTrack(i);
  if (!bytes) return null;
  try {
    // decodeAudioData détache le tampon : on lui en donne une copie pour pouvoir redécoder plus tard
    return await c.decodeAudioData(bytes.slice(0));
  } catch {
    return null;
  }
}

/** Lance la musique (sans effet si elle joue déjà ou si le volume est nul). */
export async function startMusic(): Promise<void> {
  if (playing || volume <= 0) return;
  const c = audioContext();
  if (!c) return;
  starting ??= (async () => {
    const buffer = await decode(c, 0);
    if (!buffer || playing) return;
    playing = true;
    out = c.createGain();
    out.gain.value = volume;
    out.connect(c.destination);
    play(c, 0, buffer, c.currentTime + 0.05, FADE_IN);
    // les autres morceaux se téléchargent une fois le premier lancé, pour ne pas le retarder
    for (let i = 1; i < TRACKS.length; i++) void fetchTrack(i);
  })().finally(() => {
    starting = null;
  });
  await starting;
}

/** Programme un morceau à l'instant `at`, avec un fondu d'entrée, et le fondu de sortie à sa fin. */
function play(c: AudioContext, track: number, buffer: AudioBuffer, at: number, fadeIn: number): void {
  if (!out) return;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const gain = c.createGain();
  const end = at + buffer.duration;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.linearRampToValueAtTime(1, at + fadeIn);
  gain.gain.setValueAtTime(1, end - CROSSFADE);
  gain.gain.linearRampToValueAtTime(0.0001, end);
  src.connect(gain).connect(out);
  src.start(at);
  src.stop(end + 0.1);
  cur = { track, buffer, src, gain };
  passes++;
  // le morceau suivant commence pendant le fondu de sortie de celui-ci ; il est préparé un peu avant
  const next = end - CROSSFADE;
  clearTimeout(timer);
  timer = window.setTimeout(() => void advance(c, next), Math.max(0, (next - c.currentTime - PREPARE) * 1000));
}

/** Décode le morceau qui suit le passage en cours et le programme à l'instant `at`. */
async function advance(c: AudioContext, at: number): Promise<void> {
  const from = cur;
  if (!from) return;
  const track = (from.track + 1) % TRACKS.length;
  const buffer = track === from.track ? from.buffer : await decode(c, track);
  if (cur !== from) return; // un autre enchaînement a eu lieu pendant le décodage
  const start = Math.max(at, c.currentTime + 0.05);
  // si le morceau suivant n'a pas pu être chargé, le même reprend
  if (buffer) play(c, track, buffer, start, CROSSFADE);
  else play(c, from.track, from.buffer, start, CROSSFADE);
}

/** Passe tout de suite au morceau suivant, en fondu enchaîné (tests automatisés). */
export function skipMusic(): void {
  const c = out?.context as AudioContext | undefined;
  if (!cur || !c) return;
  const t = c.currentTime;
  const g = cur.gain.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(Math.max(0.0001, g.value), t);
  g.linearRampToValueAtTime(0.0001, t + CROSSFADE);
  try {
    cur.src.stop(t + CROSSFADE + 0.1);
  } catch {
    // déjà arrêté
  }
  clearTimeout(timer);
  void advance(c, t);
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
