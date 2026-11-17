// Test des plans (copier / coller) dans Chromium.
// 1) Démo « logistique » vue par le joueur 1 : Ctrl+C, cadre glissé sur des bâtiments terminés
//    (fonderie, assembleur avec recette, entrepôt avec sortie choisie), plan enregistré, export.
// 2) Partie réelle contre une IA : import du texte, Ctrl+V, rotation (R), clic : ordres de
//    construction attendus, Maj+clic garde l'outil, Échap annule ; recettes envoyées quand
//    l'entrepôt et l'assembleur collés sont terminés.
// Usage : node tools/e2e-plans.mjs http://127.0.0.1:3091 (serveur de test neuf : la partie occupe le salon)
import { launchBrowser } from "./browser.mjs";

const base = (process.argv[2] ?? "http://127.0.0.1:3091").replace(/\/$/, "");
const browser = await launchBrowser();
let failed = 0;
const check = (ok, what, extra = "") => {
  console.log(`${ok ? "ok  " : "ÉCHEC"} ${what}${extra ? " — " + extra : ""}`);
  if (!ok) failed++;
};
const errors = [];
const track = (page) => {
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
};
/** Sans rendu, la caméra n'est jamais mise à jour : on le fait à la main après chaque déplacement. */
const aim = (page, x, z, distance = 70) => page.evaluate(([x, z, distance]) => {
  const sc = window.__game.client.scene;
  sc.target.set(x, 0, z);
  sc.distance = distance;
  sc.yaw = 0;
  sc.updateCamera();
  sc.camera.updateMatrixWorld();
}, [x, z, distance]);
/** Position à l'écran d'un point du sol (hauteur lue en visant le sol, deux passes). */
const screenOf = (page, x, z) => page.evaluate(([x, z]) => {
  const { client } = window.__game;
  const p = { x: 0, y: 0 };
  let h = client.scene.target.y;
  for (let i = 0; i < 3; i++) {
    client.scene.project(x, h, z, p);
    const q = client.groundAt(p.x, p.y);
    if (!q) break;
    h = q.y;
  }
  return p;
}, [x, z]);

// ---------- 1) copie dans la démo ----------
let exported = "";
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  track(page);
  await page.goto(`${base}/?k=testkey&demo=logistique&webgl&norender`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${base}/?k=testkey&demo=logistique&webgl&norender`);
  await page.waitForFunction(() => window.__game?.client.frame && window.__game.ui.me === 0, null, { timeout: 150000 });
  await aim(page, 86, 212, 70);
  await page.waitForFunction(() => window.__game.client.frame.nBuildings > 0, null, { timeout: 20000 });
  await page.mouse.move(640, 380);
  await page.keyboard.press("Control+KeyC");
  check(await page.evaluate(() => window.__game.ui.mode === "copy"), "Ctrl+C : outil Copier");
  const a = await screenOf(page, 72.5, 202.5);
  const b = await screenOf(page, 100.5, 222.5);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  const preview = await page.evaluate(() => window.__game.plans.status);
  check(/4 bâtiments/.test(preview), "aperçu pendant le glissé", preview);
  await page.mouse.up();
  await page.waitForFunction(() => window.__game.plans.list.length === 1, null, { timeout: 5000 }).catch(() => {});
  const plan = await page.evaluate(() => {
    const { plans } = window.__game;
    const p = plans.list.find((x) => x.id === plans.active);
    return p ? JSON.parse(JSON.stringify(p)) : null;
  });
  check(!!plan, "plan enregistré et actif");
  const keys = plan?.parts.map((p) => p.key).sort().join(",");
  check(keys === "assembler1,furnace,generator,warehouse", "bâtiments capturés (rails hors cadre ignorés)", keys);
  const asm = plan?.parts.find((p) => p.key === "assembler1");
  const wh = plan?.parts.find((p) => p.key === "warehouse");
  const fur = plan?.parts.find((p) => p.key === "furnace");
  check(asm?.recipe && wh?.recipe === "steel" && !fur?.recipe, "recettes : assembleur et sortie d'entrepôt, pas la fonderie automatique", JSON.stringify({ asm: asm?.recipe, wh: wh?.recipe, fur: fur?.recipe }));
  check(await page.evaluate(() => window.__game.ui.mode === ""), "pas de bâtisseur (démo) : l'outil se referme");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("supreme.plans") ?? "null"));
  check(stored?.plans?.length === 1 && stored.active === plan?.id, "bibliothèque dans localStorage");
  // bibliothèque : L ouvre le panneau ; renommer ; exporter
  await page.keyboard.press("KeyL");
  check(await page.locator(".plans").isVisible(), "L : panneau des plans");
  await page.click(".plans button[title='Renommer']");
  await page.fill(".plans .name-in", "Atelier d'acier");
  await page.keyboard.press("Enter");
  check(await page.evaluate(() => window.__game.plans.list[0].name === "Atelier d'acier" && JSON.parse(localStorage.getItem("supreme.plans")).plans[0].name === "Atelier d'acier"), "renommer (enregistré)");
  await page.click(".plans button[title^='Exporter']");
  exported = await page.inputValue(".plans textarea");
  check(exported.startsWith("SUPREME-PLAN-1:"), "export en texte", exported.slice(0, 40) + "…");
  await page.close();
}

// ---------- 2) collage dans une vraie partie ----------
{
  const url = `${base}/?k=testkey&webgl&norender`;
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  track(page);
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
  await page.fill("input", "Planificateur");
  await page.click("button[type=submit]");
  await page.waitForSelector("text=Ajouter une IA");
  await page.click("button:has-text('Tortue')");
  await page.click("button:has-text('Lancer la partie')");
  await page.waitForFunction(() => window.__game?.client.frame, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const cmdr = await page.evaluate(() => {
    const { client, ui } = window.__game;
    const id = client.frame.players[ui.me].commander;
    client.selectIds([id]);
    return id;
  });
  const pos = await page.evaluate((id) => {
    const u = window.__game.client.selectedUnits().find((x) => x.id === id);
    return { x: u.x / 256, z: u.y / 256 };
  }, cmdr);
  await aim(page, pos.x + 12, pos.z, 70);
  // import par le panneau
  await page.keyboard.press("KeyL");
  await page.click(".plans button:has-text('Importer')");
  await page.fill(".plans textarea", "  " + exported.slice(0, 30) + "\n" + exported.slice(30) + "\n");
  await page.click(".plans button:has-text('Ajouter à la bibliothèque')");
  const imp = await page.evaluate(() => {
    const { plans } = window.__game;
    const p = plans.list.find((x) => x.id === plans.active);
    return p && { name: p.name, n: p.parts.length, recipes: p.parts.filter((x) => x.recipe).length };
  });
  check(imp?.name === "Atelier d'acier" && imp.n === 4 && imp.recipes === 2, "import (texte recopié avec retours à la ligne)", JSON.stringify(imp));
  await page.keyboard.press("Escape");
  check(!(await page.locator(".plans").isVisible()), "Échap ferme le panneau");

  // outil Coller : fantômes sous le curseur
  await page.mouse.move(640, 380);
  await page.keyboard.press("Control+KeyV");
  check(await page.evaluate(() => window.__game.ui.mode === "paste"), "Ctrl+V : outil Coller");
  // chercher un endroit où tout se pose
  const spot = await page.evaluate(async () => {
    const { client } = window.__game;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 150));
      const cells = client.plans.cells;
      if (cells.length && cells.every((c) => c.ok)) return { ok: true, cells: cells.length };
      if (i === 39) break;
      // décaler la souris
      const x = 400 + ((i * 97) % 480), y = 250 + ((i * 53) % 260);
      client.mouse.x = x;
      client.mouse.y = y;
      client.plans.move();
    }
    return { ok: false, cells: client.plans.cells.map((c) => c.ok) };
  });
  check(spot.ok, "fantômes valides (vert) trouvés", JSON.stringify(spot));
  const before = await page.evaluate(() => window.__game.client.plans.cells.map((c) => ({ kind: c.kind, x: c.x, y: c.y, dir: c.dir })));
  // rotation de tout le plan
  await page.keyboard.press("KeyR");
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.__game.client.plans.cells.map((c) => ({ kind: c.kind, x: c.x, y: c.y, dir: c.dir })));
  const dirsTurned = before.length === after.length && after.every((c) => before.some((b) => b.kind === c.kind && ((b.dir + 1) & 3) === c.dir));
  const bw = (l) => Math.max(...l.map((c) => c.x)) - Math.min(...l.map((c) => c.x));
  const bh = (l) => Math.max(...l.map((c) => c.y)) - Math.min(...l.map((c) => c.y));
  check(dirsTurned && before.length === 4, "R : directions +1 pour tout le plan", JSON.stringify(after));
  check(bw(before) !== bw(after) || bh(before) !== bh(after), "R : plan tourné (étendue échangée)", `${bw(before)}×${bh(before)} → ${bw(after)}×${bh(after)}`);
  // trois quarts de tour de plus : retour à l'orientation de départ
  for (let i = 0; i < 3; i++) await page.keyboard.press("KeyR");
  await page.waitForTimeout(400);
  const back = await page.evaluate(() => window.__game.client.plans.cells.map((c) => ({ kind: c.kind, x: c.x, y: c.y, dir: c.dir })));
  check(JSON.stringify(back) === JSON.stringify(before), "4 × R : orientation de départ");
  // clic : ordres de construction interceptés
  await page.evaluate(() => {
    const { client } = window.__game;
    window.__cmds = [];
    const cmd = client.cmd.bind(client);
    client.cmd = (c) => { window.__cmds.push(c); cmd(c); };
  });
  const cell = await page.evaluate(() => ({ x: window.__game.client.mouse.x, y: window.__game.client.mouse.y }));
  const expectBuilds = await page.evaluate(() => window.__game.client.plans.cells.filter((c) => c.ok).length);
  await page.mouse.move(cell.x, cell.y);
  await page.waitForTimeout(300);
  await page.keyboard.down("Shift");
  await page.mouse.click(cell.x, cell.y);
  await page.keyboard.up("Shift");
  const sent = await page.evaluate(() => window.__cmds);
  const builds = sent.filter((c) => c[0] === 3);
  check(builds.length === expectBuilds && builds.every((c) => c[6] === 1 && c[7] === cmdr), `Maj+clic : ${expectBuilds} ordres BUILD pour le commandant`, JSON.stringify(builds));
  check(builds.every((c) => c[1] === 1), "Maj : tous en file");
  check(await page.evaluate(() => window.__game.ui.mode === "paste"), "Maj+clic garde l'outil actif");
  // ordre du plus proche voisin depuis le commandant
  const order = await page.evaluate(([builds, id]) => {
    const { client } = window.__game;
    const u = client.selectedUnits().find((x) => x.id === id);
    const d = builds.map((c) => { const def = client.data.buildings[c[2]]; return Math.hypot(c[3] + def.w / 2 - u.x / 256, c[4] + def.h / 2 - u.y / 256); });
    return d;
  }, [builds, cmdr]);
  check(order[0] === Math.min(...order), "premier chantier : le plus proche du commandant", order.map((x) => x.toFixed(1)).join(" "));
  const pend = await page.evaluate(() => window.__game.client.plans.pending.map((p) => ({ kind: p.kind, recipe: p.recipe })));
  check(pend.length === 2, "recettes en attente (assembleur, entrepôt)", JSON.stringify(pend));
  // clic droit annule
  await page.mouse.click(cell.x, cell.y, { button: "right" });
  check(await page.evaluate(() => window.__game.ui.mode === ""), "clic droit : outil annulé");
  // Échap annule aussi
  await page.keyboard.press("Control+KeyV");
  await page.keyboard.press("Escape");
  check(await page.evaluate(() => window.__game.ui.mode === ""), "Échap : outil annulé");
  // aide générée depuis le module de raccourcis
  await page.keyboard.press("F1");
  const help = await page.locator(".modal").innerText();
  check(/copier une zone/i.test(help) && /coller le plan actif/i.test(help) && /Bibliothèque de plans/.test(help), "aide : actions des plans");
  await page.keyboard.press("Escape");
  // recettes envoyées quand l'entrepôt et l'assembleur collés sont terminés (le commandant construit dans l'ordre)
  const cx = builds.reduce((s, c) => s + c[3], 0) / builds.length;
  const cz = builds.reduce((s, c) => s + c[4], 0) / builds.length;
  await aim(page, cx + 1, cz + 1, 80);
  const got = await page.waitForFunction(() => {
    const r = window.__cmds.filter((c) => c[0] === 9);
    return r.length >= 2 && window.__game.client.plans.pending.length === 0 ? r : null;
  }, null, { timeout: 240000, polling: 500 }).then((h) => h.jsonValue(), () => null);
  check(!!got, "setRecipe envoyé à la fin de chaque chantier (entrepôt, assembleur), file d'attente vidée", JSON.stringify(got));
  if (got) {
    await page.waitForTimeout(1500);
    const applied = await page.evaluate((got) => Promise.all(got.map((c) => window.__game.client.query("building", [c[1]]).then((r) => r?.recipe === c[2]))), got);
    check(applied.every(Boolean), "la simulation a appliqué les recettes", JSON.stringify(applied));
  }
  await page.close();
}

console.log(errors.length ? "erreurs de la page :\n" + errors.slice(0, 10).join("\n") : "aucune erreur dans la page");
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
