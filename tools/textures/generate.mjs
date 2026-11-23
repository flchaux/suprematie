// Génère les textures des modèles 3D (matières répétables) et du sol avec l'API d'images d'OpenAI
// (clé : variable OPENAI_API_KEY). Images brutes dans tools/textures/raw/ (non versionné) ;
// process.py les rend raccordables et les réduit pour le client.
//
//   node tools/textures/generate.mjs [clé…] [--quality low|medium|high] [--force]
// Les textures du sol ont pour clé « ground_<nom> » (ex. ground_grass) ; « ground » seul les choisit toutes.
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { MATERIALS, STYLE, ORGANIC_STYLE, GROUND, GROUND_STYLE } from "./manifest.mjs";

const RAW = new URL("./raw/", import.meta.url).pathname;
const KEY = process.env.OPENAI_API_KEY;
if (!KEY) {
  console.error("OPENAI_API_KEY manquante");
  process.exit(1);
}
const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf("--" + n);
  return i >= 0 ? args[i + 1] : d;
};
const quality = opt("quality", "medium");
const model = opt("model", "gpt-image-1.5");
const only = new Set(args.filter((a, i) => !a.startsWith("--") && !["--quality", "--model"].includes(args[i - 1])));
mkdirSync(RAW, { recursive: true });

async function gen(key, prompt) {
  const file = `${RAW}${key}.png`;
  if (existsSync(file) && !args.includes("--force")) return "existe";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model, prompt, size: "1024x1024", quality, background: "opaque", output_format: "png", n: 1 }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.data?.[0]?.b64_json) {
      writeFileSync(file, Buffer.from(body.data[0].b64_json, "base64"));
      return "ok";
    }
    const msg = body.error?.message ?? res.status;
    if (attempt === 3 || res.status === 400) return "échec : " + msg;
    await new Promise((r) => setTimeout(r, 4000 * attempt));
  }
  return "échec";
}

const all = [
  ...MATERIALS.map((m) => ({ key: m.key, prompt: `${m.style === "organic" ? ORGANIC_STYLE : STYLE} Surface: ${m.desc}` })),
  ...GROUND.map((g) => ({ key: `ground_${g.key}`, prompt: `${GROUND_STYLE} Ground: ${g.desc}` })),
];
const jobs = all.filter((j) => !only.size || only.has(j.key) || (only.has("ground") && j.key.startsWith("ground_")));
await Promise.all(
  jobs.map(async (j) => {
    const t0 = Date.now();
    console.log(`${j.key} : ${await gen(j.key, j.prompt)} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }),
);
