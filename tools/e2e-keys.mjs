// Test des raccourcis clavier dans Chromium.
// 1) Partie réelle contre une IA : groupes (Maj+chiffre puis chiffre, touche « 1 » qui donne « & »),
//    menu de construction B → catégorie → bâtiment puis pose à la souris, I sans ingénieur, marque-pages.
// 2) Démo locale (armées et usines déjà construites) avec une disposition AZERTY simulée :
//    rangée de l'usine (Maj = ×5), I (ingénieur inactif suivant), libellés, écran « Raccourcis ».
// Usage : node tools/e2e-keys.mjs http://127.0.0.1:3071
import { mkdirSync } from "node:fs";
import { launchBrowser } from "./browser.mjs";

const base = (process.argv[2] ?? "http://127.0.0.1:3061").replace(/\/$/, "");
mkdirSync("tools/viewer/captures", { recursive: true });
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
/** Appui synthétique : code physique et caractère (pour simuler une autre disposition). */
const key = (page, code, k, mods = {}) => page.evaluate(([code, k, mods]) => {
  window.dispatchEvent(new KeyboardEvent("keydown", { code, key: k, bubbles: true, ...mods }));
  window.dispatchEvent(new KeyboardEvent("keyup", { code, key: k, bubbles: true, ...mods }));
}, [code, k, mods]);

// ---------- 1) partie réelle ----------
{
  const url = `${base}/?k=testkey&webgl&norender`;
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  track(page);
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
  await page.fill("input", "Clavier");
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
    client.centerOnCommander();
    return id;
  });
  await page.mouse.move(640, 300);

  // groupes : Maj+1 (vraie touche) crée, Échap désélectionne, « & » (code Digit1) rappelle
  await page.keyboard.press("Shift+Digit1");
  check(await page.evaluate((id) => JSON.stringify(window.__game.client.groups.get(1)) === JSON.stringify([id]), cmdr), "Maj+1 crée le groupe 1");
  await page.keyboard.press("Escape");
  check(await page.evaluate(() => window.__game.client.selected.size === 0), "Échap désélectionne");
  await key(page, "Digit1", "&");
  check(await page.evaluate((id) => window.__game.client.selected.has(id), cmdr), "touche « 1 » qui donne « & » : rappelle le groupe 1");
  await key(page, "Digit2", "é", { ctrlKey: true });
  check(await page.evaluate(() => window.__game.client.groups.get(2)?.length === 1), "Ctrl+2 (quand le navigateur le laisse passer) crée le groupe 2");
  // double appui : centre la caméra
  await page.evaluate(() => { const sc = window.__game.client.scene; sc.target.x += 40; sc.target.z += 40; });
  await key(page, "Digit1", "&");
  await key(page, "Digit1", "&");
  const centered = await page.evaluate(() => {
    const { client } = window.__game;
    const u = client.selectedUnits()[0];
    return Math.hypot(client.scene.target.x - u.x / 256, client.scene.target.z - u.y / 256);
  });
  check(centered < 1, "chiffre deux fois : caméra centrée", `écart ${centered.toFixed(2)}`);

  // marque-pages : Maj+F2 enregistre, F2 rappelle
  const saved = await page.evaluate(() => ({ x: window.__game.client.scene.target.x, z: window.__game.client.scene.target.z }));
  await page.keyboard.press("Shift+F2");
  await page.evaluate(() => { window.__game.client.scene.target.x += 30; });
  await page.keyboard.press("F2");
  const back = await page.evaluate(() => ({ x: window.__game.client.scene.target.x, z: window.__game.client.scene.target.z }));
  check(Math.abs(back.x - saved.x) < 1e-6 && Math.abs(back.z - saved.z) < 1e-6, "Maj+F2 puis F2 : marque-page");

  // menu de construction : B, 4 (Énergie), 1 (Générateur)
  await page.waitForTimeout(400);
  await page.keyboard.press("KeyB");
  check(await page.evaluate(() => window.__game.kb.buildStep === "cat"), "B ouvre le menu de construction");
  check((await page.textContent(".build .hint")).includes("Catégorie"), "l'invite « Catégorie ? » s'affiche");
  const tabNums = await page.$$eval(".build .tab .kn", (els) => els.map((e) => e.textContent).join(""));
  check(tabNums === "1234567", "numéros sur les onglets", tabNums);
  await page.keyboard.press("Digit4");
  check(await page.evaluate(() => window.__game.kb.buildStep === "item" && window.__game.kb.buildCat === 3), "4 choisit la catégorie Énergie");
  check(await page.isVisible("button.tab.on[title='Énergie']"), "onglet Énergie affiché");
  await page.screenshot({ path: "tools/viewer/captures/e2e-keys-menu.png" });
  await page.keyboard.press("Digit1");
  const placing = await page.evaluate(() => {
    const { ui } = window.__game;
    return { mode: ui.mode, key: ui.buildKind >= 0 ? ui.data.buildings[ui.buildKind].key : "" };
  });
  check(placing.mode === "build" && placing.key === "generator", "1 entre dans la pose du générateur", JSON.stringify(placing));
  // sans rendu, la caméra ne projette pas la souris : on calcule le fantôme comme le ferait
  // le survol (requête canPlaceMany à côté du commandant), puis on pose par un vrai clic
  const ghost = await page.evaluate(async () => {
    const { client, ui } = window.__game;
    const u = client.selectedUnits()[0];
    const cx = Math.floor(u.x / 256), cy = Math.floor(u.y / 256);
    for (let d = 4; d < 30; d++) {
      for (const [x, y] of [[cx + d, cy], [cx - d, cy], [cx, cy + d], [cx, cy - d]]) {
        const ok = await client.query("canPlaceMany", [ui.me, ui.buildKind, x, y, ui.buildDir]);
        if (ok?.[0]) {
          client.ghostCells = [{ x, y, dir: ui.buildDir, ok: true }];
          return client.ghostCells;
        }
      }
    }
    return [];
  });
  await page.evaluate(() => {
    const { client } = window.__game;
    window.__sent = [];
    const send = client.send.bind(client);
    client.send = (m) => { window.__sent.push(m); send(m); };
  });
  await page.mouse.click(640, 300);
  const sent = await page.evaluate(() => window.__sent.filter((m) => m.t === "cmd").length);
  check(sent === 1 && (await page.evaluate(() => window.__game.ui.mode === "")), "clic : ordre de construction envoyé, mode de pose terminé", `${sent} ordre(s)`);
  // la simulation (serveur + Worker) l'a reçu : le commandant n'est plus inactif
  // (sans rendu, la vue de la caméra est vide et les bâtiments ne sont pas transmis à l'interface)
  const built = await page.waitForFunction((id) => {
    const { client } = window.__game;
    const f = client.frame;
    for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) if (f.buf[o] >>> 0 === id) return !(((f.buf[o + 1] >> 16) & 0xff) & 64);
    return false;
  }, cmdr, { timeout: 20000 }).then(() => true, () => false);
  check(built, "le commandant part construire le générateur", "fantôme " + JSON.stringify(ghost));
  // Échap annule le menu sans désélectionner
  await page.keyboard.press("KeyB");
  await page.keyboard.press("Escape");
  check(await page.evaluate(() => window.__game.kb.buildStep === "" && window.__game.client.selected.size === 1), "Échap referme le menu et garde la sélection");

  // I sans ingénieur : message
  await page.keyboard.press("KeyI");
  check(await page.evaluate(() => window.__game.ui.messages.some((m) => m.text === "Aucun ingénieur inactif")), "I sans ingénieur inactif : message");

  // la discussion garde ses touches
  await page.keyboard.press("Enter");
  await page.waitForSelector(".chatbox input");
  await page.keyboard.type("bah1");
  check(await page.evaluate(() => window.__game.client.selected.size === 1 && !window.__game.ui.showHelp && window.__game.kb.buildStep === ""), "frappe dans la discussion : aucun raccourci");
  await page.keyboard.press("Escape");
  await page.close();
}

// ---------- 2) démo, disposition AZERTY simulée ----------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  track(page);
  await page.addInitScript(() => {
    const az = { KeyQ: "a", KeyW: "z", KeyE: "e", KeyR: "r", KeyT: "t", KeyY: "y", KeyU: "u", KeyI: "i", KeyO: "o", KeyP: "p", KeyA: "q", KeyS: "s", KeyD: "d", KeyF: "f", KeyG: "g", KeyH: "h", KeyJ: "j", KeyK: "k", KeyL: "l", Semicolon: "m", KeyZ: "w", KeyX: "x", KeyC: "c", KeyV: "v", KeyB: "b", KeyN: "n", KeyM: ",", Comma: ";", Period: ":", Slash: "!", Digit1: "&", Digit6: "-", Minus: ")", Equal: "=" };
    Object.defineProperty(navigator, "keyboard", { configurable: true, value: { getLayoutMap: async () => new Map(Object.entries(az)) } });
  });
  await page.goto(`${base}/?k=testkey&demo&webgl&norender`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${base}/?k=testkey&demo&webgl&norender`);
  await page.waitForFunction(() => window.__game?.client.frame && window.__game.ui.screen === "game", null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  check(await page.evaluate(() => window.__game.keymap.layout.kind === "azerty"), "disposition AZERTY détectée");
  check(await page.evaluate(() => window.__game.keymap.get("attackMove")[0].code === "KeyQ" && window.__game.keymap.held("panUp", new Set(["KeyW"]))), "AZERTY : A = KeyQ, Z = défilement haut");

  // La démo n'a ni usine ni ingénieur : on fige les images de la simulation et on prépare l'état
  // côté client (sélection d'une usine du joueur 0, quelques unités transformées en ingénieurs).
  const info = await page.evaluate(() => {
    const { client, ui } = window.__game;
    ui.me = 0;
    const orig = client.worker.onmessage;
    client.worker.onmessage = (e) => { if (e.data.type !== "frame") orig(e); };
    window.__queued = [];
    client.queueUnit = (k, d) => window.__queued.push([k, d]);
    const eng = ui.data.units.findIndex((u) => u.key === "eng1");
    const f = client.frame;
    const mine = [];
    for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) {
      const w = f.buf[o + 1];
      if (((w >> 8) & 0xff) === 0 && ui.data.units[w & 0xff].key !== "commander") mine.push(o);
    }
    // 3 ingénieurs inactifs, 1 ingénieur occupé (sans le drapeau IDLE)
    const idle = [];
    mine.slice(0, 4).forEach((o, j) => {
      const flags = j < 3 ? 64 : 0;
      f.buf[o + 1] = eng | (0 << 8) | (flags << 16);
      if (j < 3) idle.push(f.buf[o] >>> 0);
    });
    const units = ui.data.units.map((u, i) => ({ u, i })).filter(({ u }) => u.factory === 1).map(({ i }) => i);
    return { idle: idle.sort((a, b) => a - b), units, busy: f.buf[mine[3]] >>> 0, factoryKind: ui.data.buildings.findIndex((b) => b.key === "land_factory") };
  });

  // usine terrestre sélectionnée (état d'interface simulé : updateUi suspendu)
  await page.evaluate((kind) => {
    const { client, ui } = window.__game;
    window.__updateUi = client.updateUi;
    client.updateUi = () => {};
    client.selected = new Set([0x40000001]);
    ui.selUnits = [];
    ui.canBuild = false;
    ui.selBuilding = { ref: 0x40000001, kind, owner: 0 };
    ui.buildingInfo = { build: 65536, hp: 4000, queue: [], inv: [], repeat: false, working: false, net: 1, sat: 1024 };
  }, info.factoryKind);
  await page.waitForSelector(".sel .ub .hk", { timeout: 5000 });
  const badges = await page.$$eval(".sel .ub .hk", (els) => els.map((e) => e.textContent));
  check(badges.slice(0, 10).join(" ") === "W X C V B N , ; : !", "touches affichées sur les boutons de l'usine", badges.join(" "));
  await page.screenshot({ path: "tools/viewer/captures/e2e-keys-usine.png" });
  // touche de l'unité 1 (W en AZERTY = KeyZ), puis Maj + unité 2 (X)
  await key(page, "KeyZ", "w");
  await key(page, "KeyX", "X", { shiftKey: true });
  const queued = await page.evaluate(() => window.__queued);
  check(JSON.stringify(queued) === JSON.stringify([[info.units[0], 1], [info.units[1], 5]]), "rangée de l'usine : unité 1 ×1, Maj+unité 2 ×5", JSON.stringify(queued));
  // C sert à l'usine (unité 3)
  await key(page, "KeyC", "c");
  check(await page.evaluate(() => window.__queued.length === 3 && window.__queued[2][1] === 1), "C : unité 3 quand l'usine est sélectionnée");
  await page.evaluate(() => {
    const { client, ui } = window.__game;
    client.updateUi = window.__updateUi;
    client.selected = new Set();
    ui.selBuilding = null;
    ui.buildingInfo = null;
  });

  // I : ingénieurs inactifs du joueur 0, par identifiant croissant et en boucle
  const order = [];
  for (let j = 0; j < 4; j++) {
    await key(page, "KeyI", "i");
    order.push(await page.evaluate(() => {
      const { client } = window.__game;
      const u = client.selectedUnits()[0];
      return { sel: [...client.selected], cam: u ? Math.hypot(client.scene.target.x - u.x / 256, client.scene.target.z - u.y / 256) : 99 };
    }));
  }
  const seq = order.map((o) => o.sel[0]);
  check(JSON.stringify(seq) === JSON.stringify([...info.idle, info.idle[0]]), "I : ingénieurs inactifs dans l'ordre, puis retour au premier", JSON.stringify(seq));
  check(order.every((o) => o.sel.length === 1 && o.cam < 1e-3), "I centre la caméra sur l'ingénieur");
  check(!seq.includes(info.busy), "I ignore l'ingénieur occupé");

  // commandant sélectionné : badge « A » sur l'attaque, A (KeyQ) passe en attaque en mouvement
  await page.evaluate(() => { const { client, ui } = window.__game; client.selectIds([client.frame.players[0].commander]); ui.mode = ""; });
  await page.waitForTimeout(300);
  const cmdKeys = await page.$$eval(".sel .cmds .key", (els) => els.map((e) => e.textContent).join(" "));
  check(cmdKeys.startsWith("X A P G"), "libellés AZERTY sur les boutons d'ordre", cmdKeys);
  await key(page, "KeyQ", "a");
  check(await page.evaluate(() => window.__game.ui.mode === "attackMove"), "A (KeyQ) : attaque en mouvement");
  await page.keyboard.press("Escape");

  // écran « Raccourcis » depuis le menu ⚙ : réassigner Arrêt sur K, conflit avec A, réinitialiser
  await page.click("button[title='Réglages']");
  await page.click("button:has-text('Raccourcis clavier')");
  await page.waitForSelector(".modal.keys");
  const row = (label) => page.locator(".modal.keys .row", { has: page.locator(`.lbl:text-is("${label}")`) });
  await row("Arrêt").locator("button:has-text('Modifier')").click();
  check(await page.evaluate(() => window.__game.kb.capturing), "Modifier : attente d'une touche");
  await page.keyboard.press("KeyK");
  check(await page.evaluate(() => window.__game.keymap.get("stop")[0].code === "KeyK" && JSON.parse(localStorage.getItem("supreme.keys")).stop[0].code === "KeyK"), "Arrêt réassigné sur K et enregistré");
  await row("Patrouille").locator("button:has-text('Modifier')").click();
  await key(page, "KeyQ", "a"); // même touche que l'attaque
  const warn = await row("Patrouille").locator(".note.warn").textContent().catch(() => "");
  check(warn.includes("Attaque en mouvement"), "conflit signalé", warn.trim());
  check((await page.textContent(".modal.keys .modal-head")).includes("1 conflit"), "compteur de conflits");
  await page.screenshot({ path: "tools/viewer/captures/e2e-keys-raccourcis.png" });
  await row("Arrêt").locator("button:has-text('Modifier')").click();
  await page.keyboard.press("Digit5");
  check((await page.textContent(".modal.keys .err")).includes("groupes"), "chiffre refusé (groupes)");
  await page.keyboard.press("Escape");
  check(await page.evaluate(() => !window.__game.kb.capturing && window.__game.kb.showKeys), "Échap annule la saisie sans fermer l'écran");
  await page.click(".modal.keys button:has-text('Réinitialiser')");
  check(await page.evaluate(() => localStorage.getItem("supreme.keys") === null && window.__game.keymap.get("stop")[0].code === "KeyX"), "Réinitialiser");
  await page.keyboard.press("Escape");
  check(await page.evaluate(() => !window.__game.kb.showKeys), "Échap ferme l'écran");
  // aide : générée depuis le module, accès à l'écran de personnalisation
  await page.keyboard.press("F1");
  const help = await page.textContent(".modal");
  check(help.includes("Attaque en mouvement") && help.includes("↑ / Z") && help.includes("Maj+1…0"), "l'aide liste les touches du module");
  await page.click(".modal button:has-text('Personnaliser les raccourcis')");
  check(await page.evaluate(() => window.__game.kb.showKeys && !window.__game.ui.showHelp), "l'aide ouvre l'écran « Raccourcis »");
  await page.close();
}

console.log("erreurs de la page :", errors.slice(0, 8));
await browser.close();
if (failed || errors.length) {
  console.log(`${failed} vérification(s) en échec`);
  process.exit(1);
}
console.log("tout est bon");
