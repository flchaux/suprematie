// Musique de fond en vrai : au premier geste du joueur, le premier morceau démarre ; le second n'est demandé au
// serveur qu'une fois le premier téléchargé ; les morceaux alternent (passage forcé avec skipMusic, qui enchaîne
// en fondu comme la fin d'un morceau) ; aucune erreur. Avec FULL=1, attend aussi l'enchaînement naturel en fin
// de morceau (environ 2 min 20).
// Usage : [WEBGPU=1 xvfb-run …] [FULL=1] node tools/e2e-music.mjs http://127.0.0.1:3061
import { launchBrowser } from "./browser.mjs";

const base = (process.argv[2] ?? "http://127.0.0.1:3061").replace(/\/$/, "");
const gpu = !!process.env.WEBGPU;
const browser = await launchBrowser([], gpu ? { headless: false } : {});
let failed = 0;
const check = (ok, what, extra = "") => {
  console.log(`${ok ? "ok  " : "ÉCHEC"} ${what}${extra ? " — " + extra : ""}`);
  if (!ok) failed++;
};

try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 750 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  // téléchargements des morceaux : début de la requête, fin de la réponse
  const net = {};
  // morceaux communs seulement (ceux des races, theme-industriels…, ne passent pas dans le salon)
  const trackOf = (url) => /\/theme-(industriels|souche|transhumants)/.test(url) ? null : /\/theme2[-.][^/]*\.mp3/.test(url) ? "theme2" : /\/theme[-.][^/]*\.mp3/.test(url) ? "theme" : null;
  page.on("request", (r) => {
    const t = trackOf(r.url());
    if (t) net[t] = { ...net[t], requested: Date.now() };
  });
  page.on("requestfinished", (r) => {
    const t = trackOf(r.url());
    if (t) net[t] = { ...net[t], finished: Date.now() };
  });
  const url = `${base}/?k=testkey&demo=formation${gpu ? "" : "&webgl"}`;
  await page.goto(url);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("supreme.gfx", JSON.stringify({ ground: false, decor: false, shadows: false, bloom: false }));
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__game?.client.frame?.nUnits > 0, null, { timeout: 150000 });
  const state = () => page.evaluate(() => window.__game.musicState());

  const before = await state();
  check(!before.playing && before.requested === 0 && !net.theme, "rien avant le premier geste", JSON.stringify(before));
  check(before.tracks >= 2, "au moins deux morceaux", `${before.tracks}`);

  // premier geste : une touche sans effet en jeu
  await page.keyboard.press("F7");
  await page.waitForFunction(() => window.__game.musicState().playing, null, { timeout: 60000 });
  let s = await state();
  check(s.track === 0 && s.passes === 1, "le premier morceau démarre", JSON.stringify(s));
  check(Math.abs(s.duration - 145) < 1, "durée du premier morceau", `${s.duration.toFixed(2)} s`);
  check(await page.evaluate(() => window.__game.musicPlaying()), "musicPlaying");

  // le second morceau est demandé après la fin du téléchargement du premier
  await page.waitForFunction(() => window.__game.musicState().requested >= window.__game.musicState().queue, null, { timeout: 10000 });
  await page.waitForTimeout(3000);
  check(!!net.theme2?.requested && net.theme2.requested >= net.theme.finished, "le second morceau est téléchargé après le premier",
    JSON.stringify(net));

  // passage au suivant : fondu enchaîné vers le second, puis retour au premier
  for (const [want, passes] of [[1, 2], [0, 3]]) {
    await page.evaluate(() => window.__game.skipMusic());
    await page.waitForFunction((p) => window.__game.musicState().passes >= p, passes, { timeout: 60000 });
    s = await state();
    check(s.track === want && s.passes === passes, `enchaînement vers le morceau ${want + 1}`, JSON.stringify(s));
    check(Math.abs(s.duration - 145) < 1, `durée du morceau ${want + 1}`, `${s.duration.toFixed(2)} s`);
  }

  if (process.env.FULL) {
    // enchaînement naturel : le suivant est programmé 20 s avant la fin du fondu de sortie
    console.log("attente de l'enchaînement naturel…");
    await page.waitForFunction(() => window.__game.musicState().passes >= 4, null, { timeout: 200000, polling: 1000 });
    s = await state();
    check(s.track === 1, "enchaînement naturel vers le second morceau", JSON.stringify(s));
  }

  check(errors.length === 0, "aucune erreur dans la page", errors.slice(0, 5).join(" | "));
} finally {
  await browser.close();
}
console.log(failed ? `${failed} échec(s)` : "tout est bon");
process.exit(failed ? 1 : 0);
