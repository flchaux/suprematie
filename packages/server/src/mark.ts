// Ping d'un joueur sur la carte : relayé à son équipe seulement, au plus quelques-uns par seconde.
/** délai minimal entre deux pings d'un même joueur (ms) */
export const MARK_EVERY_MS = 400;

export interface MarkPeer { slot: number; markAt?: number }

/** Point valide sur la carte (cases), ou null. */
export function markPoint(x: unknown, z: unknown, mapSize: number): { x: number; z: number } | null {
  if (typeof x !== "number" || typeof z !== "number" || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  const c = (v: number) => Math.round(Math.min(mapSize, Math.max(0, v)) * 10) / 10;
  return { x: c(x), z: c(z) };
}

/** Le joueur peut-il signaler un point maintenant (il n'en a pas signalé juste avant) ? Note l'heure si oui. */
export function markAllowed(from: MarkPeer, now: number): boolean {
  if (from.slot < 0 || now - (from.markAt ?? -1e9) < MARK_EVERY_MS) return false;
  from.markAt = now;
  return true;
}

/** Destinataires : les joueurs de la même équipe, l'auteur compris (jamais un adversaire ni un spectateur). */
export function markPeers<T extends MarkPeer>(from: MarkPeer, peers: Iterable<T>, teamOf: (slot: number) => number | undefined): T[] {
  const team = teamOf(from.slot);
  return [...peers].filter((p) => p.slot >= 0 && team !== undefined && teamOf(p.slot) === team);
}
