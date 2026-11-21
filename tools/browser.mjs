// Lance Chromium pour les tests et captures (réutilise un Chromium déjà installé par Playwright).
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

/** `opts` : options de Playwright, par exemple { headless: false } pour WebGPU (sous xvfb-run). */
export async function launchBrowser(extraArgs = [], opts = {}) {
  const candidates = [process.env.CHROME_PATH, `${homedir()}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`].filter(Boolean);
  const executablePath = candidates.find((p) => existsSync(p));
  return chromium.launch({ executablePath, args: ["--enable-unsafe-webgpu", "--enable-webgl", "--ignore-gpu-blocklist", ...extraArgs], ...opts });
}
