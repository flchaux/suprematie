// Icônes générées (objets, bâtiments, unités) et illustrations, indexées par clé de données.
// Fichiers : src/assets/sprites/<catégorie>/<clé>.webp (voir tools/sprites/).
const all = import.meta.glob("../assets/sprites/*/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

const table = new Map<string, string>();
for (const [path, url] of Object.entries(all)) {
  const m = path.match(/sprites\/([^/]+)\/([^/]+)\.webp$/);
  if (m) table.set(`${m[1]}/${m[2]}`, url);
}

export type SpriteCat = "items" | "buildings" | "units" | "art";

/** Adresse de l'icône, ou undefined si elle n'existe pas (l'interface affiche alors un repli). */
export function sprite(cat: SpriteCat, key: string | undefined): string | undefined {
  return key ? table.get(`${cat}/${key}`) : undefined;
}
