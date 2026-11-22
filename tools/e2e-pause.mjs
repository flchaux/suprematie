// Pause et menu de partie (Échap), en vrai : deux joueurs (Ana, hôte, et Bob) et une IA.
// Bob ne peut pas mettre en pause ; Échap d'Ana désélectionne puis ouvre le menu, qui met la partie en pause
// pour tous au même tick ; le menu de Bob ne la reprend pas ; refermer le menu d'Ana la reprend ; Échap annule
// un outil avant d'ouvrir le menu ; Sauvegarder ; Quitter (deux clics) ramène tout le monde au salon.
//   PORT=3093 [WEBGPU=1 sous xvfb-run] node tools/e2e-pause.mjs
// Démarre son propre serveur (build du client dans packages/client/dist, données dans un dossier temporaire).
import { launchBrowser } from "./browser.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = Number(process.env.PORT ?? 3093);
const gpu = !!process.env.WEBGPU;
const root = new URL("..", import.meta.url).pathname;
const data = mkdtempSync(join(tmpdir(), "e2e-pause-"));
const server = spawn(process.execPath, ["packages/server/src/main.ts"], {
  cwd: root,
  env: { ...process.env, PORT: String(port), SUPREME_KEY: "testkey", SUPREME_DATA: data, SUPREME_DIST: join(root, "packages/client/dist") },
  stdio: ["ignore", "pipe", "inherit"],
});
await new Promise((res) => server.stdout.on("data", (d) => String(d).includes("serveur prêt") && res()));
server.stdout.on("data", (d) => process.env.VERBOSE && process.stdout.write("[serveur] " + d));

let failed = 0;
const check = (ok, m) => {
  console.log(ok ? "ok    " : "ÉCHEC ", m);
  if (!ok) failed++;
};
const browser = await launchBrowser([], gpu ? { headless: false } : {});
const pages = {};
try {
  for (const name of ["Ana", "Bob"]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => console.log(name, "erreur", e.message));
    p.on("console", (m) => m.type() === "error" && console.log(name, "console", m.text().slice(0, 300)));
    // Bob ne dessine pas (une seule carte graphique logicielle à partager)
    const url = `http://127.0.0.1:${port}/?k=testkey${name === "Bob" || !gpu ? "&norender&webgl" : ""}`;
    await p.goto(url);
    await p.evaluate(() => localStorage.clear());
    await p.goto(url);
    await p.fill("input", name);
    await p.click("button[type=submit]");
    await p.waitForFunction(() => window.__game?.ui.lobby, null, { timeout: 20000 });
    pages[name] = p;
  }
  const { Ana: A, Bob: B } = pages;
  await A.waitForSelector("text=Ajouter une IA");
  await A.click("button:has-text('Adaptative')");
  await A.waitForTimeout(500);
  await A.click("button:has-text('Lancer la partie')");
  // fenêtre d'Ana au premier plan : une fenêtre cachée ne dessine pas (WebGPU sous xvfb)
  await A.bringToFront();
  for (const p of [A, B])
    await p.waitForFunction(() => window.__game?.client.frame?.tick > 100 && window.__game.ui.screen === "game", null, { timeout: 180000 }).catch(async (e) => {
      console.log("état", await p.evaluate(() => ({ screen: window.__game.ui.screen, tick: window.__game.client.frame?.tick, backend: window.__game.ui.backend, scene: !!window.__game.client.scene })));
      throw e;
    });
  const tick = (p) => p.evaluate(() => window.__game.client.frame.tick);
  const speed = (p) => p.evaluate(() => window.__game.ui.speed);

  // Bob (pas l'hôte) : pause refusée
  await B.evaluate(() => window.__game.client.setPaused(true));
  await B.waitForTimeout(800);
  check((await speed(A)) === 1 && (await speed(B)) === 1, "Bob ne peut pas mettre en pause");
  check(await B.evaluate(() => window.__game.ui.messages.some((m) => m.text.includes("hôte"))), "Bob reçoit un avis");

  // Ana : Échap désélectionne d'abord (le commandant est sélectionné au début), puis ouvre le menu
  await A.evaluate(() => window.__game.client.selected.add(window.__game.client.frame.players[window.__game.ui.me].commander));
  await A.keyboard.press("Escape");
  await A.waitForTimeout(200);
  check(!(await A.evaluate(() => window.__game.ui.menuOpen)) && (await A.evaluate(() => window.__game.client.selected.size)) === 0, "1er Échap : désélection, pas de menu");
  await A.keyboard.press("Escape");
  await A.waitForSelector("[aria-label='Menu de la partie']");
  await A.waitForFunction(() => window.__game.ui.speed === 0, null, { timeout: 30000 });
  await B.waitForFunction(() => window.__game.ui.speed === 0, null, { timeout: 30000 });
  await A.waitForTimeout(600);
  const [ta, tb] = [await tick(A), await tick(B)];
  await A.waitForTimeout(1500);
  check((await tick(A)) === ta && (await tick(B)) === tb, `aucun tick pendant la pause (Ana ${ta}, Bob ${tb})`);
  check(ta === tb, "les deux clients arrêtés au même tick");
  check(await B.evaluate(() => window.__game.ui.messages.some((m) => m.text === "Partie mise en pause par Ana") && window.__game.ui.pausedBy === "Ana"), "Bob voit qui a mis en pause");
  check(await B.isVisible(".pausebar"), "bandeau de pause chez Bob");
  if (gpu) {
    await A.waitForTimeout(1500);
    await A.screenshot({ path: "tools/viewer/captures/e2e-pause-menu.png", timeout: 180000 });
  }

  // Bob ouvre son menu : Quitter grisé ; le refermer ne reprend pas la partie
  await B.keyboard.press("Escape");
  await B.keyboard.press("Escape");
  await B.waitForSelector("[aria-label='Menu de la partie']");
  check(await B.isDisabled("button:has-text('Quitter vers le salon')"), "Quitter grisé pour Bob");
  check(await B.isDisabled("button:has-text('Charger une partie')"), "Charger grisé pour Bob");
  await B.keyboard.press("Escape");
  await B.waitForTimeout(800);
  check((await speed(A)) === 0 && !(await B.evaluate(() => window.__game.ui.menuOpen)), "le menu de Bob se referme sans reprendre la partie");

  // Options : les réglages de la barre du haut
  await A.click("button:has-text('Options')");
  check(await A.isVisible("text=Ombres portées"), "Options : réglages graphiques");
  await A.click("button:has-text('Retour au menu')");

  // Ana referme le menu : la partie reprend pour tous
  await A.click("button:has-text('Reprendre')");
  await B.waitForFunction(() => window.__game.ui.speed === 1, null, { timeout: 30000 });
  await A.waitForFunction((t) => window.__game.client.frame.tick > t + 20, ta, { timeout: 20000 });
  await B.waitForFunction((t) => window.__game.client.frame.tick > t + 20, tb, { timeout: 20000 });
  check(true, "la partie reprend chez Ana et Bob");

  // Échap annule un outil avant d'ouvrir le menu
  await A.evaluate(() => {
    const c = window.__game.client;
    c.selected.add(c.frame.players[window.__game.ui.me].commander);
    c.setMode("attackMove");
  });
  await A.keyboard.press("Escape");
  await A.waitForTimeout(200);
  check(!(await A.evaluate(() => window.__game.ui.mode)) && !(await A.evaluate(() => window.__game.ui.menuOpen)), "Échap annule l'outil sans ouvrir le menu");
  // un panneau ouvert se ferme d'abord
  await A.evaluate(() => (window.__game.ui.showStats = true));
  await A.keyboard.press("Escape");
  await A.waitForTimeout(200);
  check(!(await A.evaluate(() => window.__game.ui.showStats)) && !(await A.evaluate(() => window.__game.ui.menuOpen)), "Échap ferme le panneau sans ouvrir le menu");

  // touche Pause : pause et reprise hors menu
  await A.evaluate(() => window.__game.client.selected.clear());
  await A.keyboard.press("Pause");
  await B.waitForFunction(() => window.__game.ui.speed === 0, null, { timeout: 30000 });
  await A.keyboard.press("Pause");
  await B.waitForFunction(() => window.__game.ui.speed === 1, null, { timeout: 30000 });
  check(true, "touche Pause : pause puis reprise");

  // Sauvegarder depuis le menu
  await A.keyboard.press("Escape");
  await A.waitForSelector("[aria-label='Menu de la partie']");
  await A.click("button:has-text('Sauvegarder')");
  await A.waitForSelector("text=Sauvegardée", { timeout: 20000 });
  check(true, "Sauvegarder depuis le menu");

  // Quitter : premier clic = confirmation, second = retour au salon pour tous, avec sauvegarde automatique
  await A.click("button:has-text('Quitter vers le salon')");
  check(await A.isVisible("text=Confirmer"), "Quitter demande confirmation");
  await A.click("button:has-text('Confirmer')");
  for (const p of [A, B]) await p.waitForFunction(() => window.__game.ui.screen === "lobby" && !window.__game.ui.lobby.running, null, { timeout: 15000 });
  check(true, "retour au salon pour Ana et Bob");
  const saves = await A.evaluate(async () => (await fetch("/api/saves")).json());
  check(saves.some((s) => s.auto) && saves.some((s) => !s.auto), `sauvegardes : ${saves.map((s) => s.name).join(" ; ")}`);
  check(await A.isVisible("text=Lancer la partie"), "Ana est toujours l'hôte du salon");
} finally {
  await browser.close();
  server.kill();
  rmSync(data, { recursive: true, force: true });
}
console.log(failed ? `${failed} échec(s)` : "Pause et menu : tout est bon");
process.exitCode = failed ? 1 : 0;
