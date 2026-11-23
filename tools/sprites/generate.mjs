// Génère les icônes de l'interface avec l'API d'images d'OpenAI (clé : variable OPENAI_API_KEY).
// Les images brutes (1024 px, PNG) vont dans tools/sprites/raw/ (non versionné) ; process.py les
// réduit ensuite en WebP dans packages/client/src/assets/sprites/.
//
//   node tools/sprites/generate.mjs [items|buildings|units|art|decor] [clé…] [--quality low|medium|high] [--force]
//
// Une image déjà générée n'est pas redemandée (sauf --force).
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { STYLE, ITEM_STYLE, ITEMS, BUILDINGS, UNITS, ART, DECOR, DECOR_STYLE, SOUCHE_STYLE, SOUCHE_ITEM_STYLE, SOUCHE_ITEMS, SOUCHE_BUILDINGS, SOUCHE_UNITS } from "./manifest.mjs";

const ROOT = new URL("./raw/", import.meta.url).pathname;
const KEY = process.env.OPENAI_API_KEY;
if (!KEY) {
  console.error("OPENAI_API_KEY manquante");
  process.exit(1);
}
const args = process.argv.slice(2);
const flag = (n) => args.includes("--" + n);
const opt = (n, d) => {
  const i = args.indexOf("--" + n);
  return i >= 0 ? args[i + 1] : d;
};
const quality = opt("quality", "medium");
const model = opt("model", "gpt-image-1.5"); // gpt-image-2 ne gère pas les fonds transparents
const WITH_VALUE = ["--quality", "--model", "--concurrency"];
const positional = args.filter((a, i) => !a.startsWith("--") && !WITH_VALUE.includes(args[i - 1]));
const cats = ["items", "buildings", "units", "art", "decor"];
const onlyCat = positional.find((a) => cats.includes(a));
const onlyKeys = new Set(positional.filter((a) => !cats.includes(a)));

const jobs = [];
const add = (cat, key, prompt, size = "1024x1024", background = "transparent") => {
  if (onlyCat && cat !== onlyCat) return;
  if (onlyKeys.size && !onlyKeys.has(key)) return;
  jobs.push({ cat, key, prompt, size, background });
};
for (const [k, s] of Object.entries(ITEMS)) add("items", k, `${ITEM_STYLE} Subject: ${s}.`);
for (const [k, s] of Object.entries(BUILDINGS)) add("buildings", k, `${STYLE} Subject: ${s}.`);
for (const [k, s] of Object.entries(UNITS)) add("units", k, `${STYLE} Subject: ${s}.`);
// la Souche : mêmes catégories (le client cherche l'icône par clé), style organique
for (const [k, s] of Object.entries(SOUCHE_ITEMS)) add("items", k, `${SOUCHE_ITEM_STYLE} Subject: ${s}.`);
for (const [k, s] of Object.entries(SOUCHE_BUILDINGS)) add("buildings", k, `${SOUCHE_STYLE} Subject: ${s}.`);
for (const [k, s] of Object.entries(SOUCHE_UNITS)) add("units", k, `${SOUCHE_STYLE} Subject: ${s}.`);
for (const [k, a] of Object.entries(ART)) add("art", k, a.prompt, a.size, a.background);
for (const [k, s] of Object.entries(DECOR)) add("decor", k, `${DECOR_STYLE} Subject: ${s}.`);

async function gen(j) {
  const dir = ROOT + j.cat;
  mkdirSync(dir, { recursive: true });
  const file = `${dir}/${j.key}.png`;
  if (existsSync(file) && !flag("force")) return "existe";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model, prompt: j.prompt, size: j.size, quality, background: j.background, output_format: "png", n: 1 }),
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

const CONC = Number(opt("concurrency", "4"));
let next = 0;
let done = 0;
async function worker() {
  while (next < jobs.length) {
    const j = jobs[next++];
    const t0 = Date.now();
    const r = await gen(j);
    done++;
    console.log(`[${done}/${jobs.length}] ${j.cat}/${j.key} : ${r} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
