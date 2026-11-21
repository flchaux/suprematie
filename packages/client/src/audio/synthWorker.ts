// Calcul des sons de combat hors du fil principal : la synthèse d'un tampon prend de quelques
// millisecondes à quelques dixièmes de seconde, ce qui ferait sauter des images du jeu.
import { runJob, type SynthJob, type SynthResult } from "./synth.ts";

const scope = self as unknown as { onmessage: ((e: { data: SynthJob }) => void) | null; postMessage: (m: SynthResult, transfer: ArrayBuffer[]) => void };
scope.onmessage = (e) => {
  const res = runJob(e.data);
  scope.postMessage(res, res.chans.map((c) => c.buffer as ArrayBuffer));
};
