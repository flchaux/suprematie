// Lance Chromium pour les tests et captures (réutilise un Chromium déjà installé par Playwright).
//
// Le rendu est logiciel sur ce serveur (pas de carte graphique) : un navigateur ouvert prend un à deux cœurs
// sur quatre. Pour ne pas saturer la machine qui héberge aussi les vraies parties :
// - un seul navigateur à la fois sur toute la machine, toutes sessions et worktrees confondus : les autres
//   attendent leur tour (verrou ~/.cache/supreme-browser.lock, libéré à la fermeture du navigateur ou à la
//   fin du processus, repris d'office si son détenteur est mort ou le garde depuis plus de 20 minutes) ;
// - priorité basse (nice 10) pour le script et le navigateur qu'il lance.
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, setPriority } from "node:os";

const LOCK = `${homedir()}/.cache/supreme-browser.lock`;
/** Au-delà, le verrou est considéré comme abandonné (test bloqué). */
const LOCK_MAX_MS = 20 * 60 * 1000;

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

function holder() {
  try {
    return Number(readFileSync(`${LOCK}/pid`, "utf8")) || 0;
  } catch {
    return 0;
  }
}

function release() {
  if (holder() === process.pid) rmSync(LOCK, { recursive: true, force: true });
}

async function acquire() {
  let waited = false;
  for (;;) {
    try {
      mkdirSync(LOCK, { recursive: false });
      writeFileSync(`${LOCK}/pid`, String(process.pid));
      process.once("exit", release);
      for (const sig of ["SIGINT", "SIGTERM"]) process.once(sig, () => (release(), process.exit(130)));
      return;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
    const pid = holder();
    let age = 0;
    try {
      age = Date.now() - statSync(LOCK).mtimeMs;
    } catch {
      continue;
    }
    // détenteur mort, verrou trop vieux, ou verrou sans pid (création interrompue) depuis plus de 10 s
    if ((pid && !alive(pid)) || age > LOCK_MAX_MS || (!pid && age > 10000)) {
      console.log(`navigateur : verrou abandonné (pid ${pid || "?"}, ${Math.round(age / 1000)} s), repris`);
      rmSync(LOCK, { recursive: true, force: true });
      continue;
    }
    if (!waited) console.log(`navigateur : un autre test en utilise un (pid ${pid}), attente de son tour…`);
    waited = true;
    await new Promise((r) => setTimeout(r, 3000));
  }
}

/** `opts` : options de Playwright, par exemple { headless: false } pour WebGPU (sous xvfb-run). */
export async function launchBrowser(extraArgs = [], opts = {}) {
  try {
    setPriority(10); // hérité par Chromium
  } catch {
    // priorité déjà plus basse
  }
  await acquire();
  const candidates = [process.env.CHROME_PATH, `${homedir()}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`].filter(Boolean);
  const executablePath = candidates.find((p) => existsSync(p));
  const browser = await chromium.launch({ executablePath, args: ["--enable-unsafe-webgpu", "--enable-webgl", "--ignore-gpu-blocklist", ...extraArgs], ...opts });
  browser.on("disconnected", release);
  return browser;
}
