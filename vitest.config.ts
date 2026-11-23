import { defineConfig } from "vitest/config";
import { sharedAlias } from "./tools/shared-alias.mjs";

// L'alias fait lire le code partagé de CE dossier : dans un worktree, node_modules est celui du
// dossier principal et « @supreme/shared » y mène au code partagé du dossier principal.
export default defineConfig({
  resolve: { alias: sharedAlias },
  test: { include: ["packages/**/test/**/*.test.ts"], testTimeout: 60000 },
});
