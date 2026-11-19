// Chiffres des modèles : triangles de près et de loin (niveau de détail réduit), dimensions de la boîte.
// Usage : node tools/viewer/stats.ts [units|buildings|items|decor|exp] [clé1,clé2]
// Les dimensions comptent : le jeu met chaque modèle à l'échelle de sa boîte (garder celles d'avant).
import { buildModel } from "../../packages/client/src/models/generator.ts";
import { UNIT_MODELS } from "../../assets/models/units.ts";
import { BUILDING_MODELS } from "../../assets/models/buildings.ts";
import { ITEM_MODELS } from "../../assets/models/items.ts";
import { DECOR_MODELS } from "../../assets/models/decor.ts";
import type { Model } from "../../assets/models/types.ts";

const set = process.argv[2] ?? "units";
const only = process.argv[3]?.split(",");
const models: Record<string, Model> = set === "buildings" ? BUILDING_MODELS : set === "items" ? ITEM_MODELS : set === "decor" ? DECOR_MODELS : UNIT_MODELS;
const f = (v: number) => v.toFixed(2);
let tri = 0;
let lo = 0;
for (const [key, m] of Object.entries(models)) {
  if (only && !only.includes(key)) continue;
  const b = buildModel(m);
  tri += b.triangles;
  lo += b.trianglesLo;
  const s = { x: b.box.max.x - b.box.min.x, y: b.box.max.y - b.box.min.y, z: b.box.max.z - b.box.min.z };
  console.log(`${key.padEnd(22)} ${String(b.triangles).padStart(5)} / loin ${String(b.trianglesLo).padStart(5)}   boîte ${f(s.x)} x ${f(s.y)} x ${f(s.z)}   (x ${f(b.box.min.x)}..${f(b.box.max.x)}, z ${f(b.box.min.z)}..${f(b.box.max.z)})`);
}
console.log(`total ${tri} / loin ${lo}`);
