import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";
import { sharedAlias } from "../../tools/shared-alias.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  plugins: [svelte()],
  // code partagé de ce dossier, même dans un worktree (voir tools/shared-alias.mjs)
  resolve: { alias: sharedAlias },
  server: {
    port: 5173,
    fs: { allow: [root] },
    proxy: { "/ws": { target: "ws://127.0.0.1:3060", ws: true }, "/api": "http://127.0.0.1:3060", "/replays": "http://127.0.0.1:3060" },
    headers: { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" },
  },
  worker: { format: "es" },
  build: { target: "es2022", chunkSizeWarningLimit: 4000 },
});
