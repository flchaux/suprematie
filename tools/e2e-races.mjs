// Races en jeu réel : un joueur choisit sa race dans le salon et joue contre une IA. Contrôles : race
// reçue par la simulation, barre du haut et menu de construction de la race ; Souche : une frondaison
// plantée par la Reine qui pousse sur le terreau ; Transhumants : un chenillard qui se déploie puis se
// replie, l'arbre de recherche de la race ; aucune erreur dans la page. Captures dans le dossier donné.
// Une partie par race (le serveur n'en héberge qu'une) : relancer le serveur entre les deux.
// Usage : node tools/e2e-races.mjs http://127.0.0.1:3083 souche|transhumants [dossier des captures]
import { launchBrowser } from "./browser.mjs";
import { mkdirSync } from "node:fs";

const base = (process.argv[2] ?? "http://127.0.0.1:3083").replace(/\/$/, "");
const which = process.argv[3] ?? "souche";
const outDir = process.argv[4] ?? new URL("./viewer/captures", import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });
const webgpu = !!process.env.WEBGPU;
const browser = await launchBrowser([], webgpu ? { headless: false } : {});
let failed = 0;
const check = (ok, what, extra = "") => {
  console.log(`${ok ? "ok  " : "ÉCHEC"} ${what}${extra ? " — " + extra : ""}`);
  if (!ok) failed++;
};
const url = `${base}/?k=testkey${webgpu ? "" : "&webgl"}`;

/** Point de la page (sur le canevas, hors interface) dont le sol visé est (x, z) en cases. */
async function screenAt(page, x, z) {
  return page.evaluate(([x, z]) => {
    const { client } = window.__game;
    const r = client.canvasEl.getBoundingClientRect();
    let best = { x: 0, y: 0, d: Infinity };
    for (let sy = 60; sy < r.height - 20; sy += 4) {
      for (let sx = 20; sx < r.width - 20; sx += 4) {
        const g = client.groundAt(sx, sy);
        if (!g) continue;
        const d = Math.hypot(g.x - x, g.z - z);
        if (d >= best.d || d > 0.4) continue;
        const el = document.elementFromPoint(sx + r.left, sy + r.top);
        if (el !== client.canvasEl && !client.canvasEl.contains(el)) continue;
        best = { x: sx + r.left, y: sy + r.top, d };
      }
    }
    return best;
  }, [x, z]);
}

async function open(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("supreme.gfx", JSON.stringify({ ground: false, decor: false, shadows: false, bloom: false })); });
  await page.goto(url);
  await page.fill("input", name);
  await page.click("button[type=submit]");
  await page.waitForSelector("text=Salon de préparation");
  return { page, errors };
}

const me = await open(which === "souche" ? "Racine" : "Nomade");
const raceName = which === "souche" ? "Souche" : "Transhumants";
await me.page.waitForSelector("select:has(option:has-text('Transhumants'))");
await me.page.locator(".player.me, .player", { hasText: which === "souche" ? "Racine" : "Nomade" }).first().locator("select:has(option:has-text('Souche'))").selectOption({ label: raceName });
await me.page.waitForTimeout(800);
const lobbyRaces = await me.page.evaluate(() => window.__game.ui.lobby.players.map((p) => p.race ?? 0));
check(lobbyRaces[0] === (which === "souche" ? 1 : 2), "race choisie dans le salon", JSON.stringify(lobbyRaces));
await me.page.screenshot({ path: `${outDir}/races-salon-${which}.png` });
await me.page.click("button:has-text('Tortue')");
await me.page.click("button:has-text('Lancer la partie')");
await me.page.waitForFunction(() => window.__game?.client.frame && window.__game.ui.data, null, { timeout: 120000 });
await me.page.waitForTimeout(2000);
const a = me;
const b = me;

if (which === "souche") {
// ---------- Souche ----------
const sa = await a.page.evaluate(() => {
  const { client, ui } = window.__game;
  const me = client.frame.players[ui.me];
  return { race: ui.race, seve: ui.seve, sels: ui.sels, cats: [...document.querySelectorAll(".build .tab .tn")].map((e) => e.textContent), commander: me.commander };
});
check(sa.race === 1, "joueur Souche : race 1 dans la simulation");
check(sa.seve >= 400 && sa.sels >= 150, "réserve de départ du réseau", `sève ${sa.seve}, sels ${sa.sels}`);
// Reine sélectionnée : menu de construction de la Souche
await a.page.evaluate(() => {
  const { client, ui } = window.__game;
  client.selectIds([client.frame.players[ui.me].commander]);
  client.centerOnCommander();
});
await a.page.waitForTimeout(800);
const cats = await a.page.evaluate(() => [...document.querySelectorAll(".build .tabs > .tab")].map((e) => e.getAttribute("title")));
check(cats.join(",") === "Réseau,Organes,Défense", "menu de construction de la Souche", cats.join(","));
// planter une frondaison sur le terreau, à côté de la graine-mère (par l'ordre, comme le fait l'interface)
const planted = await a.page.evaluate(() => {
  const { client, ui } = window.__game;
  const d = ui.data;
  const leaves = d.buildings.findIndex((x) => x.key === "leaves");
  const heart = d.buildings.findIndex((x) => x.key === "seed_heart");
  const f = client.frame;
  let hb = null;
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) {
    if ((f.buf[o + 1] & 0xff) === heart && ((f.buf[o + 1] >> 8) & 0xff) === ui.me) hb = { x: f.buf[o + 2] & 0xffff, y: f.buf[o + 2] >>> 16 };
  }
  if (!hb) return null;
  // à droite de la graine-mère (3 × 3), sur son terreau ; ordre BUILD : [type, file, genre, x, y, dir, n, unités…]
  const x = hb.x + 4, y = hb.y;
  client.cmd([3, 0, leaves, x, y, 0, 1, client.frame.players[ui.me].commander]);
  return { x, y };
});
check(!!planted, "ordre de plantation envoyé");
const t0 = await a.page.evaluate(() => window.__game.client.frame.tick);
// la Reine marche jusqu'au chantier, plante, puis la frondaison pousse (12 s) : on attend 25 s de jeu
await a.page.waitForFunction((t) => window.__game.client.frame.tick > t + 500, t0, { timeout: 600000 });
const grown = await a.page.evaluate(() => {
  const { client, ui } = window.__game;
  const leaves = ui.data.buildings.findIndex((x) => x.key === "leaves");
  const f = client.frame;
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) {
    if ((f.buf[o + 1] & 0xff) === leaves && ((f.buf[o + 1] >> 8) & 0xff) === ui.me) return { build: f.buf[o + 4] };
  }
  return null;
});
check(!!grown, "frondaison plantée", JSON.stringify(grown));
await a.page.screenshot({ path: `${outDir}/races-souche.png`, timeout: 120000 });

// partie solo : on accélère (4×) pour la suite
await a.page.evaluate(() => { for (let i = 0; i < 5; i++) window.__game.client.stepSpeed(1); });

// ---------- racines tracées en glissant : une file continue, orientée, reliée à la graine-mère ----------
const heartAt = await a.page.evaluate(() => {
  const { client, ui } = window.__game;
  const heart = ui.data.buildings.findIndex((x) => x.key === "seed_heart");
  const f = client.frame;
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) {
    if ((f.buf[o + 1] & 0xff) === heart && ((f.buf[o + 1] >> 8) & 0xff) === ui.me) return { x: f.buf[o + 2] & 0xffff, y: f.buf[o + 2] >>> 16, ref: f.buf[o] >>> 0 };
  }
  return null;
});
const aimAt = (x, z, distance = 40) => a.page.evaluate(([x, z, distance]) => {
  const sc = window.__game.client.scene;
  sc.target.set(x, 0, z);
  sc.distance = distance;
  sc.yaw = 0;
  sc.updateCamera();
  sc.camera.updateMatrixWorld();
}, [x, z, distance]);
const screenOf = (x, z) => a.page.evaluate(([x, z]) => {
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
// la ligne de racines part vers le côté le plus dégagé (est ou ouest) de la graine-mère
const lineSide = await a.page.evaluate(async ([hx, hy]) => {
  const { client, ui } = window.__game;
  const root = ui.data.buildings.findIndex((x) => x.key === "root");
  const tryLine = async (sx) => {
    const args = [ui.me, root];
    for (let k = 0; k < 8; k++) args.push(sx > 0 ? hx + 3 + k : hx - 1 - k, hy + 1, 0);
    const ok = await client.query("canPlaceMany", args);
    return (ok ?? []).filter(Boolean).length;
  };
  return (await tryLine(1)) >= (await tryLine(-1)) ? 1 : -1;
}, [heartAt.x, heartAt.y]);
const x0 = lineSide > 0 ? heartAt.x + 3 : heartAt.x - 1;
const x1 = lineSide > 0 ? heartAt.x + 10 : heartAt.x - 8;
await aimAt(heartAt.x + 1.5, heartAt.y + 1.5, 45);
await a.page.evaluate(() => {
  const { client, ui } = window.__game;
  const f = client.frame;
  const sower = ui.data.units.findIndex((u) => u.key === "sower");
  const ids = [f.players[ui.me].commander];
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) if ((f.buf[o + 1] & 0xff) === sower && ((f.buf[o + 1] >> 8) & 0xff) === ui.me) ids.push(f.buf[o] >>> 0);
  client.selectIds(ids);
  client.startBuild(ui.data.buildings.findIndex((x) => x.key === "root"));
});
await a.page.waitForTimeout(300);
const pa = await screenOf(x0 + 0.5, heartAt.y + 1.5);
const pb = await screenOf(x1 + 0.5, heartAt.y + 1.5);
await a.page.mouse.move(pa.x, pa.y);
await a.page.mouse.down();
await a.page.mouse.move((pa.x + pb.x) / 2, pa.y, { steps: 5 });
await a.page.mouse.move(pb.x, pb.y, { steps: 5 });
await a.page.waitForTimeout(600);
const ghost = await a.page.evaluate(() => window.__game.client.ghostCells.map((c) => ({ x: c.x, y: c.y, dir: c.dir, ok: c.ok })));
const n = Math.abs(x1 - x0) + 1;
console.log("     cases :", ghost.map((c) => `${c.x},${c.y}${c.ok ? "" : "✗"}`).join(" "));
check(ghost.length === n && ghost.every((c, i) => i === 0 || Math.abs(c.x - ghost[i - 1].x) === 1), "racines : une file continue au glissé", `${ghost.length} cases, attendu ${n}`);
check(ghost.every((c) => c.dir === (lineSide > 0 ? 0 : 2)), "racines orientées dans le sens du tracé", ghost.map((c) => c.dir).join(""));
await a.page.mouse.up();
await a.page.keyboard.press("Escape");
const tr = await a.page.evaluate(() => window.__game.client.frame.tick);
await a.page.waitForFunction((t) => window.__game.client.frame.tick > t + 1600, tr, { timeout: 600000 });
const rootNets = await a.page.evaluate(async (heartRef) => {
  const { client, ui } = window.__game;
  const root = ui.data.buildings.findIndex((x) => x.key === "root");
  const f = client.frame;
  const refs = [];
  const all = [];
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) {
    if ((f.buf[o + 1] & 0xff) !== root || ((f.buf[o + 1] >> 8) & 0xff) !== ui.me) continue;
    all.push(`${f.buf[o + 2] & 0xffff},${f.buf[o + 2] >>> 16}:${Math.round(f.buf[o + 4] / 655.36)}%`);
    if (f.buf[o + 4] >= 65536) refs.push(f.buf[o] >>> 0);
  }
  console.log("     racines :", all.join(" "));
  const net = async (r) => { const v = await client.query("building", [r]); return (typeof v === "string" ? JSON.parse(v) : v)?.net ?? -1; };
  const hn = await net(heartRef);
  const nets = [];
  for (const r of refs) nets.push(await net(r));
  return { hn, nets };
}, heartAt.ref);
check(rootNets.nets.length >= n - 1 && rootNets.nets.every((x) => x === rootNets.hn && x > 0), "racines poussées, reliées au réseau de la graine-mère", JSON.stringify(rootNets));
const terreau = await a.page.evaluate(([hx, hy]) => {
  const t = window.__game.client.scene.terreau;
  return { here: t.data[(hy + 1) * t.w + hx + 1], far: t.data[(hy + 1) * t.w + Math.max(0, hx - 40)] };
}, [heartAt.x, heartAt.y]);
check(terreau.here === 255 && terreau.far === 0, "terreau au sol autour du réseau", JSON.stringify(terreau));
await aimAt(heartAt.x + 1.5 + lineSide * 4, heartAt.y + 1.5, 32);
await a.page.waitForTimeout(1500);
await a.page.screenshot({ path: `${outDir}/races-souche-racines.png`, timeout: 120000 });

// ---------- apprivoisement : la Reine apprivoise le nid de mordeurs sauvage le plus proche ----------
// les nids vivent autour des gisements de cristal : la Reine marche vers le plus proche jusqu'à en voir un
const findNest = () => a.page.evaluate(() => {
  const { client, ui } = window.__game;
  const f = client.frame;
  const nk = ui.data.buildings.findIndex((x) => x.key === "nest");
  let qx = 0, qz = 0;
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) if (f.buf[o] >>> 0 === f.players[ui.me].commander) { qx = f.buf[o + 2] / 256; qz = f.buf[o + 3] / 256; }
  let best = null;
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) {
    if ((f.buf[o + 1] & 0xff) !== nk || f.players[(f.buf[o + 1] >> 8) & 0xff]?.team !== 8) continue;
    const x = (f.buf[o + 2] & 0xffff) + 1.5, z = (f.buf[o + 2] >>> 16) + 1.5;
    const d = Math.hypot(x - qx, z - qz);
    if (!best || d < best.d) best = { ref: f.buf[o] >>> 0, x, z, d };
  }
  return best;
});
let nest = await findNest();
if (!nest) {
  // nids hors de vue : on les trouve dans la simulation (fiche des bâtiments), puis on lit où l'ordre
  // « Apprivoiser » envoie la Reine (cible de son premier ordre, mot auxiliaire de la trame) pour garder le plus proche
  const cands = await a.page.evaluate(async () => {
    const { client, ui } = window.__game;
    const nk = ui.data.buildings.findIndex((x) => x.key === "nest");
    const out = [];
    // référence d'un emplacement jamais réutilisé : génération 1 (bits 20 et plus)
    for (let s = 0; s < 1500; s++) {
      const v = await client.query("building", [((1 << 30) | (1 << 20) | s) >>> 0]);
      const b = typeof v === "string" ? JSON.parse(v) : v;
      // nid de la faune (joueur caché, absent ou d'équipe 8 dans la trame)
      if (b && b.kind === nk && (client.frame.players[b.owner]?.team ?? 8) === 8) out.push(((1 << 30) | (1 << 20) | s) >>> 0);
    }
    if (!out.length) {
      const hist = {};
      for (let s = 0; s < 2000; s++) {
        const v = await client.query("building", [((1 << 30) | (1 << 20) | s) >>> 0]);
        const b = typeof v === "string" ? JSON.parse(v) : v;
        if (b) hist[`${b.kind}/${b.owner}`] = (hist[`${b.kind}/${b.owner}`] ?? 0) + 1;
      }
      return { out, hist, nk };
    }
    return { out };
  }).then((r) => {
    if (r.hist) console.log("     bâtiments (type/joueur) :", JSON.stringify(r.hist), "nid =", r.nk);
    return r.out;
  });
  console.log("     nids sauvages dans la simulation :", cands.length);
  let best = null;
  for (const ref of cands) {
    const pos = await a.page.evaluate(async (ref) => {
      const { client, ui } = window.__game;
      const q = client.frame.players[ui.me].commander;
      client.cmd([52, 0, ref, 1, q]);
      const t = client.frame.tick;
      while (client.frame.tick < t + 4) await new Promise((r) => setTimeout(r, 50));
      const f = client.frame;
      for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) {
        if (f.buf[o] >>> 0 !== q) continue;
        const aux = f.buf[o + 8];
        return { code: aux >>> 24, x: aux & 0xfff, z: (aux >>> 12) & 0xfff, qx: f.buf[o + 2] / 256, qz: f.buf[o + 3] / 256 };
      }
      return null;
    }, ref);
    if (pos && pos.code === 21) {
      const d = Math.hypot(pos.x - pos.qx, pos.z - pos.qz);
      if (!best || d < best.d) best = { ref, d, x: pos.x, z: pos.z };
    }
  }
  console.log("     nid le plus proche :", JSON.stringify(best));
  if (best) {
    // la Reine y va d'elle-même (ordre « Apprivoiser ») ; on attend que le nid soit en vue
    await a.page.evaluate((ref) => { const { client, ui } = window.__game; client.cmd([52, 0, ref, 1, client.frame.players[ui.me].commander]); }, best.ref);
    // le client ne reçoit que la zone affichée : on regarde le nid
    await aimAt(best.x + 1, best.z + 1, 60);
    for (let k = 0; k < 150 && !nest; k++) {
      await a.page.waitForTimeout(2000);
      const n = await findNest();
      if (n && n.ref === best.ref) nest = n;
    }
  }
}
check(!!nest, "un nid de mordeurs sauvage sur la carte", JSON.stringify(nest));
if (nest) {
  // par l'interface : clic droit de la Reine sur le nid
  await aimAt(nest.x, nest.z, 40);
  await a.page.evaluate(() => { const { client, ui } = window.__game; client.selectIds([client.frame.players[ui.me].commander]); });
  await a.page.waitForTimeout(400);
  const pn = await screenOf(nest.x, nest.z);
  await a.page.mouse.click(pn.x, pn.y, { button: "right" });
  await a.page.waitForTimeout(400);
  const ord = await a.page.evaluate(() => window.__game.ui.messages?.map?.((m) => m.text ?? m).slice(-3) ?? []);
  console.log("     messages :", JSON.stringify(ord));
  const tn = await a.page.evaluate(() => window.__game.client.frame.tick);
  let tamed = false;
  // jusqu'à 10 min de jeu : la Reine (lente) marche jusqu'au nid, puis reste 30 s
  for (let k = 0; k < 600 && !tamed && (await a.page.evaluate((t) => window.__game.client.frame.tick - t, tn)) < 12000; k++) {
    await a.page.waitForTimeout(2000);
    tamed = await a.page.evaluate((ref) => {
      const { client, ui } = window.__game;
      const f = client.frame;
      for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) if (f.buf[o] >>> 0 === ref) return ((f.buf[o + 1] >> 8) & 0xff) === ui.me;
      return false;
    }, nest.ref);
  }
  const elapsed = await a.page.evaluate((t) => window.__game.client.frame.tick - t, tn);
  check(tamed, "nid apprivoisé par la Reine", `${Math.round(elapsed / 20)} s de jeu`);
  const beasts = await a.page.evaluate(() => {
    const { client, ui } = window.__game;
    const keys = ["beast_s", "beast_m", "beast_l"].map((k) => ui.data.units.findIndex((u) => u.key === k));
    const f = client.frame;
    let n = 0;
    for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) if (keys.includes(f.buf[o + 1] & 0xff) && ((f.buf[o + 1] >> 8) & 0xff) === ui.me) n++;
    return n;
  });
  check(beasts > 0, "la horde du nid est à la Souche", `${beasts} bêtes`);
  // fiche du nid greffé
  await a.page.evaluate((ref) => window.__game.client.selectIds([ref]), nest.ref);
  await aimAt(nest.x, nest.z, 30);
  await a.page.waitForTimeout(1500);
  await a.page.screenshot({ path: `${outDir}/races-souche-nid.png`, timeout: 120000 });
}

}
// ---------- Transhumants ----------
if (which === "transhumants") {
const tb = await b.page.evaluate(() => {
  const { client, ui } = window.__game;
  return { race: ui.race, releves: ui.stock[30] ?? 0, cats: document.querySelectorAll(".build .tab").length, nomad: !!document.querySelector(".build .nomad") };
});
check(tb.race === 2, "joueur Transhumant : race 2 dans la simulation");
check(tb.releves >= 20, "relevés de départ", String(tb.releves));
// chenillard générateur : déploiement
const gen = await b.page.evaluate(() => {
  const { client, ui } = window.__game;
  const k = ui.data.units.findIndex((u) => u.key === "ch_generator");
  const f = client.frame;
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) {
    if ((f.buf[o + 1] & 0xff) === k && ((f.buf[o + 1] >> 8) & 0xff) === ui.me) return { id: f.buf[o] >>> 0, x: f.buf[o + 2], y: f.buf[o + 3] };
  }
  return null;
});
check(!!gen, "chenillard générateur au départ");
// clic droit d'un chenillard foreuse sur un gisement libre : il s'y rend et s'y déploie
const target = await b.page.evaluate(() => {
  const { client, ui } = window.__game;
  const k = ui.data.units.findIndex((u) => u.key === "ch_drill");
  const f = client.frame;
  let drill = null;
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) {
    if ((f.buf[o + 1] & 0xff) === k && ((f.buf[o + 1] >> 8) & 0xff) === ui.me) { drill = { id: f.buf[o] >>> 0, x: f.buf[o + 2] / 256, z: f.buf[o + 3] / 256 }; break; }
  }
  if (!drill) return null;
  const busy = new Set();
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) busy.add(f.buf[o + 2] >>> 0);
  const spots = client.map.spots.filter((s) => s.kind >= 1 && s.kind <= 3).map((s) => ({ ...s, d: Math.hypot(s.x + 1 - drill.x, s.y + 1 - drill.z) })).filter((s) => s.d > 4 && s.d < 40).sort((a, b) => a.d - b.d);
  const s = spots[0];
  if (!s) return null;
  client.selectIds([drill.id]);
  const sc = client.scene;
  sc.target.set(s.x + 1, 0, s.y + 1);
  sc.distance = 26;
  sc.updateCamera();
  return { drill: drill.id, x: s.x, y: s.y, kind: s.kind };
});
check(!!target, "gisement libre près d'un chenillard foreuse");
if (target) {
  await b.page.waitForTimeout(1500);
  const screen = await screenAt(b.page, target.x + 1, target.y + 1);
  await b.page.mouse.move(screen.x, screen.y);
  await b.page.waitForTimeout(600);
  await b.page.mouse.move(screen.x + 2, screen.y + 1);
  await b.page.waitForTimeout(600);
  const cursor = await b.page.evaluate(() => window.__game.client.cursorKind);
  check(cursor === "harvest", "curseur sur le gisement avec le chenillard foreuse", cursor);
  await b.page.mouse.click(screen.x + 2, screen.y + 1, { button: "right", timeout: 120000 });
  // en plein déploiement (mât qui se relève, vers 65 %) : capture rapprochée
  const deploying = (id) => {
    const f = window.__game.client.frame;
    for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) if (f.buf[o] >>> 0 === id) return ((f.buf[o + 1] >>> 29) & 1) === 1;
    return false;
  };
  await b.page.waitForFunction(deploying, target.drill, { timeout: 900000 });
  const td = await b.page.evaluate(() => window.__game.client.frame.tick);
  await b.page.waitForFunction((t) => window.__game.client.frame.tick > t + 195, td, { timeout: 900000 });
  await b.page.evaluate(([x, z]) => {
    const sc = window.__game.client.scene;
    sc.target.set(x, 0, z);
    sc.distance = 11;
    sc.updateCamera();
  }, [target.x + 1, target.y + 1]);
  await b.page.screenshot({ path: `${outDir}/races-foreuse-mi.png`, timeout: 120000 });
  const tq = await b.page.evaluate(() => window.__game.client.frame.tick);
  // fin du déploiement
  await b.page.waitForFunction(([t, x, y]) => {
    const { client, ui } = window.__game;
    const k = ui.data.buildings.findIndex((d) => d.key === "t_drill");
    const f = client.frame;
    for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) {
      if ((f.buf[o + 1] & 0xff) === k && ((f.buf[o + 1] >> 8) & 0xff) === ui.me && (f.buf[o + 2] & 0xffff) === x && f.buf[o + 2] >>> 16 === y) return true;
    }
    return f.tick > t + 1500;
  }, [tq, target.x, target.y], { timeout: 900000 });
  const onSpot = await b.page.evaluate(([x, y]) => {
    const { client, ui } = window.__game;
    const k = ui.data.buildings.findIndex((d) => d.key === "t_drill");
    const f = client.frame;
    for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) if ((f.buf[o + 1] & 0xff) === k && (f.buf[o + 2] & 0xffff) === x && f.buf[o + 2] >>> 16 === y) return true;
    return false;
  }, [target.x, target.y]);
  check(onSpot, "foreuse déployée sur le gisement cliqué");
  await b.page.screenshot({ path: `${outDir}/races-foreuse.png`, timeout: 120000 });
}
await b.page.evaluate(([id, x, y]) => {
  const { client } = window.__game;
  client.selectIds([id]);
  const sc = client.scene;
  sc.target.set(x / 256, 0, y / 256);
  sc.distance = 14;
  sc.updateCamera();
}, [gen.id, gen.x, gen.y]);
await b.page.waitForTimeout(800);
const deployBtn = b.page.locator("button.cmd[title^='Déployer']");
check((await deployBtn.count()) === 1, "bouton Déployer du chenillard");
await deployBtn.click({ force: true, timeout: 120000 });
// mode placement : le fantôme du module suit la souris ; clic sur la position du chenillard
const placing = await b.page.evaluate(() => ({ mode: window.__game.ui.mode, kind: window.__game.ui.data.buildings[window.__game.ui.buildKind]?.key }));
check(placing.mode === "build" && placing.kind === "t_generator", "Déployer : placement du module", JSON.stringify(placing));
const gp = await screenAt(b.page, gen.x / 256, gen.y / 256);
await b.page.mouse.move(gp.x, gp.y);
await b.page.waitForTimeout(800);
await b.page.mouse.move(gp.x + 2, gp.y + 1);
await b.page.waitForTimeout(800);
await b.page.mouse.click(gp.x + 2, gp.y + 1, { timeout: 120000 });
const t1 = await b.page.evaluate(() => window.__game.client.frame.tick);
// à mi-déploiement : les stabilisateurs sortent (bit 29 du mot de l'unité)
await b.page.waitForFunction((t) => window.__game.client.frame.tick > t + 150, t1, { timeout: 600000 });
const mid = await b.page.evaluate((id) => {
  const f = window.__game.client.frame;
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) if (f.buf[o] >>> 0 === id) return (f.buf[o + 1] >>> 29) & 1;
  return -1;
}, gen.id);
check(mid === 1, "chenillard signalé en déploiement (animation des stabilisateurs)");
await b.page.screenshot({ path: `${outDir}/races-deploiement.png`, timeout: 120000 });
// trajet jusqu'à l'emplacement choisi, puis 15 s de déploiement
await b.page.waitForFunction((t) => window.__game.client.frame.tick > t + 520, t1, { timeout: 900000 });
const deployed = await b.page.evaluate(() => {
  const { client, ui } = window.__game;
  const k = ui.data.buildings.findIndex((x) => x.key === "t_generator");
  const f = client.frame;
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) {
    if ((f.buf[o + 1] & 0xff) === k && ((f.buf[o + 1] >> 8) & 0xff) === ui.me) return { ref: f.buf[o] >>> 0 };
  }
  return null;
});
check(!!deployed, "générateur nomade déployé");
await b.page.screenshot({ path: `${outDir}/races-transhumants.png`, timeout: 120000 });
if (deployed) {
  await b.page.evaluate((ref) => window.__game.client.selectIds([ref]), deployed.ref);
  await b.page.waitForTimeout(1500);
  const fold = b.page.locator("button:has-text('Replier')");
  check((await fold.count()) === 1, "bouton Replier du module");
  if (await fold.count()) {
    await fold.click({ force: true, timeout: 120000 });
    const t2 = await b.page.evaluate(() => window.__game.client.frame.tick);
    await b.page.waitForFunction((t) => window.__game.client.frame.tick > t + 20, t2, { timeout: 60000 });
    const back = await b.page.evaluate(() => {
      const { client, ui } = window.__game;
      const k = ui.data.units.findIndex((u) => u.key === "ch_generator");
      const f = client.frame;
      for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) if ((f.buf[o + 1] & 0xff) === k && ((f.buf[o + 1] >> 8) & 0xff) === ui.me) return true;
      return false;
    });
    check(back, "le module redevient un chenillard");
  }
}
// chenilles : l'Arche roule, la distance parcourue fait glisser ses crampons (render/entities.ts)
const ark = await b.page.evaluate(() => {
  const { client, ui } = window.__game;
  const id = client.frame.players[ui.me].commander;
  const f = client.frame;
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) if (f.buf[o] >>> 0 === id) return { id, x: f.buf[o + 2], y: f.buf[o + 3] };
  return null;
});
if (ark) {
  const tx = ark.x > 256 * 256 ? ark.x - 20 * 256 : ark.x + 20 * 256;
  await b.page.evaluate(([id, x, y, tx]) => {
    const { client } = window.__game;
    client.selectIds([id]);
    client.cmd([1, 0, tx, y, 1, id, tx, y]);
    const sc = client.scene;
    sc.target.set(x / 256, 0, y / 256);
    sc.distance = 30;
    sc.updateCamera();
  }, [ark.id, ark.x, ark.y, tx]);
  const t3 = await b.page.evaluate(() => window.__game.client.frame.tick);
  await b.page.waitForFunction((t) => window.__game.client.frame.tick > t + 120, t3, { timeout: 600000 });
  const dist = await b.page.evaluate((id) => window.__game.client.scene.entities.anim.get(id)?.dist ?? 0, ark.id);
  check(dist > 2, "chenilles de l'Arche : distance parcourue suivie pour l'animation", dist.toFixed(1) + " cases");
  await b.page.screenshot({ path: `${outDir}/races-chenilles.png`, timeout: 120000 });
}
// recherche : arbre de la race
await b.page.evaluate(() => (window.__game.ui.showResearch = true));
await b.page.waitForTimeout(800);
const techs = await b.page.evaluate(() => [...document.querySelectorAll(".modal .tech b")].map((e) => e.textContent));
check(techs.includes("Atelier lourd") && !techs.includes("Automatisation"), "panneau de recherche des Transhumants", techs.join(", "));
await b.page.screenshot({ path: `${outDir}/races-recherche.png`, timeout: 120000 });
}

check(me.errors.length === 0, `aucune erreur dans la page (${raceName})`, me.errors.slice(0, 4).join(" | "));
await browser.close();
console.log(failed ? `${failed} échec(s)` : "tout est bon");
process.exit(failed ? 1 : 0);
