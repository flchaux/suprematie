// Contrôles du code. Dans le code partagé et le Worker de simulation, l'horloge et l'aléatoire
// sont interdits : ils feraient diverger les simulations entre les machines.
import tseslint from "typescript-eslint";

const noClock = {
  "no-restricted-properties": [
    "error",
    { object: "Math", property: "random", message: "Aléatoire interdit : utiliser le générateur à graine de la simulation." },
    { object: "Date", property: "now", message: "Horloge interdite dans le code partagé et le Worker." },
    { object: "performance", property: "now", message: "Horloge interdite dans le code partagé et le Worker." },
  ],
  "no-restricted-globals": ["error", { name: "Date", message: "Horloge interdite dans le code partagé et le Worker." }],
};

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/*.svelte", "sim/target/**"] },
  {
    files: ["packages/**/*.ts"],
    languageOptions: { parser: tseslint.parser },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: { "no-debugger": "error" },
  },
  { files: ["packages/shared/src/**/*.ts", "packages/client/src/game/worker.ts"], rules: noClock },
);
