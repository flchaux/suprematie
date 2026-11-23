// Alias de « @supreme/shared » vers le code partagé du dossier courant (principal ou worktree),
// pour Vite et Vitest. Deux entrées : le paquet lui-même, puis ses fichiers (« @supreme/shared/orders.ts »).
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../packages/shared/src/", import.meta.url));

export const sharedAlias = [
  { find: /^@supreme\/shared$/, replacement: src + "index.ts" },
  { find: /^@supreme\/shared\//, replacement: src },
];
