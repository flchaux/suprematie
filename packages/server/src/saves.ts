// Sauvegardes de parties : état complet de la simulation (instantané), état interne des IA, ordres
// déjà émis mais pas encore exécutés, et ordres passés (pour que le replay final couvre toute la partie).
// Deux fichiers par sauvegarde dans data/saves : <id>.sav (JSON compressé) et <id>.meta.json (résumé
// affiché dans le salon, lu sans décompresser la sauvegarde).
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, renameSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { join } from "node:path";
import type { SaveMeta } from "@supreme/shared";

export interface SaveData {
  version: 1;
  meta: SaveMeta;
  params: number[];
  /** instantané de la simulation (base64) */
  snapshot: string;
  /** état interne de chaque IA (base64) */
  bots: { slot: number; state: string }[];
  /** ordres émis pour des ticks futurs */
  pending: { tick: number; player: number; cmd: number[] }[];
  /** ordres passés (replay) */
  replay: [number, number[]][];
}

const ID_RE = /^[a-z0-9-]{1,80}$/;
export const validSaveId = (id: unknown): id is string => typeof id === "string" && ID_RE.test(id);

export function writeSave(dir: string, data: SaveData): void {
  mkdirSync(dir, { recursive: true });
  const id = data.meta.id;
  if (!validSaveId(id)) throw new Error("identifiant de sauvegarde invalide");
  // écriture atomique : fichier temporaire puis renommage
  const tmp = join(dir, `${id}.sav.tmp`);
  writeFileSync(tmp, gzipSync(JSON.stringify(data), { level: 6 }));
  renameSync(tmp, join(dir, `${id}.sav`));
  writeFileSync(join(dir, `${id}.meta.json`), JSON.stringify(data.meta));
}

export function readSave(dir: string, id: string): SaveData | null {
  if (!validSaveId(id)) return null;
  const f = join(dir, `${id}.sav`);
  if (!existsSync(f)) return null;
  try {
    const d = JSON.parse(gunzipSync(readFileSync(f)).toString("utf8")) as SaveData;
    return d.version === 1 ? d : null;
  } catch {
    return null;
  }
}

export function listSaves(dir: string): SaveMeta[] {
  if (!existsSync(dir)) return [];
  const out: SaveMeta[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".meta.json")) continue;
    const id = f.slice(0, -10);
    if (!existsSync(join(dir, `${id}.sav`))) continue;
    try {
      out.push(JSON.parse(readFileSync(join(dir, f), "utf8")) as SaveMeta);
    } catch {
      // résumé illisible : ignoré
    }
  }
  return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function readSaveMeta(dir: string, id: string): SaveMeta | null {
  if (!validSaveId(id)) return null;
  return listSaves(dir).find((m) => m.id === id) ?? null;
}

export function deleteSave(dir: string, id: string): void {
  if (!validSaveId(id)) return;
  for (const f of [`${id}.sav`, `${id}.meta.json`]) if (existsSync(join(dir, f))) unlinkSync(join(dir, f));
}

/** Garde les `keep` sauvegardes automatiques les plus récentes. */
export function pruneAutosaves(dir: string, keep: number): void {
  const autos = listSaves(dir).filter((m) => m.auto);
  for (const m of autos.slice(keep)) deleteSave(dir, m.id);
}
