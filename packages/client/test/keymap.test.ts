// Raccourcis clavier : correspondance événement → action, valeurs par défaut selon la disposition, conflits.
import { describe, it, expect } from "vitest";
import { Keymap, detectLayout, defaultBindings, codeForChar, groupKey, digitOf, reservedReason, helpRows, keyLabel, ACTIONS, FACTORY_ROW, STORAGE_KEY, type KeyLike } from "../src/game/keymap.ts";

// cartes renvoyées par navigator.keyboard.getLayoutMap() (extraits)
const AZERTY_MAP = new Map([
  ["KeyQ", "a"], ["KeyW", "z"], ["KeyE", "e"], ["KeyR", "r"], ["KeyT", "t"], ["KeyY", "y"], ["KeyU", "u"], ["KeyI", "i"], ["KeyO", "o"], ["KeyP", "p"],
  ["KeyA", "q"], ["KeyS", "s"], ["KeyD", "d"], ["KeyF", "f"], ["KeyG", "g"], ["KeyH", "h"], ["KeyJ", "j"], ["KeyK", "k"], ["KeyL", "l"], ["Semicolon", "m"],
  ["KeyZ", "w"], ["KeyX", "x"], ["KeyC", "c"], ["KeyV", "v"], ["KeyB", "b"], ["KeyN", "n"], ["KeyM", ","], ["Comma", ";"], ["Period", ":"], ["Slash", "!"],
  ["Digit1", "&"], ["Digit2", "é"], ["Digit6", "-"], ["Minus", ")"], ["Equal", "="],
]);
const QWERTY_MAP = new Map([
  ..."qwertyuiopasdfghjklzxcvbnm".split("").map((c): [string, string] => ["Key" + c.toUpperCase(), c]),
  ["Digit1", "1"], ["Minus", "-"], ["Equal", "="], ["Semicolon", ";"], ["Comma", ","], ["Period", "."], ["Slash", "/"],
]);
const QWERTZ_MAP = new Map([...QWERTY_MAP, ["KeyY", "z"], ["KeyZ", "y"], ["Minus", "ß"], ["Slash", "-"]]);

const ev = (code: string, mods: Partial<KeyLike> = {}): KeyLike => ({ code, shiftKey: false, ctrlKey: false, altKey: false, ...mods });

function memStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}

describe("dispositions", () => {
  it("reconnaît AZERTY, QWERTY et les autres", () => {
    expect(detectLayout(AZERTY_MAP).kind).toBe("azerty");
    expect(detectLayout(QWERTY_MAP).kind).toBe("qwerty");
    expect(detectLayout(QWERTZ_MAP).kind).toBe("autre");
    expect(detectLayout(null, "fr-FR").kind).toBe("azerty");
    expect(detectLayout(null, "fr").kind).toBe("azerty");
    expect(detectLayout(null, "fr-CA").kind).toBe("qwerty");
    expect(detectLayout(null, "en-US").kind).toBe("qwerty");
    expect(detectLayout(AZERTY_MAP).source).toBe("api");
  });

  it("trouve la touche physique d'une lettre affichée", () => {
    expect(codeForChar(detectLayout(AZERTY_MAP), "a")).toBe("KeyQ");
    expect(codeForChar(detectLayout(AZERTY_MAP), "m")).toBe("Semicolon");
    expect(codeForChar(detectLayout(QWERTZ_MAP), "z")).toBe("KeyY");
    // « - » est sur la touche 6 en AZERTY : réservée aux groupes, donc pas retenue
    expect(codeForChar(detectLayout(AZERTY_MAP), "-")).toBeNull();
    expect(codeForChar(detectLayout(QWERTY_MAP), "-")).toBe("Minus");
  });

  it("libellés : la lettre que le joueur voit sur sa touche", () => {
    const az = detectLayout(AZERTY_MAP);
    expect(keyLabel(az, "KeyQ")).toBe("A");
    expect(keyLabel(az, "KeyW")).toBe("Z");
    expect(keyLabel(az, "Digit1")).toBe("1");
    expect(keyLabel(az, "Space")).toBe("Espace");
    expect(keyLabel(az, "Delete")).toBe("Suppr");
    expect(keyLabel(az, "KeyM")).toBe(",");
    expect(keyLabel(detectLayout(QWERTY_MAP), "KeyQ")).toBe("Q");
  });
});

describe("valeurs par défaut", () => {
  it("AZERTY : ordres mnémotechniques et ZQSD", () => {
    const d = defaultBindings(detectLayout(AZERTY_MAP));
    expect(d.attackMove).toEqual([{ code: "KeyQ" }]);
    expect(d.patrol).toEqual([{ code: "KeyP" }]);
    expect(d.selectArmy).toEqual([{ code: "KeyQ", ctrl: true }]);
    expect(d.panUp.map((c) => c.code)).toEqual(["ArrowUp", "KeyW"]);
    expect(d.panLeft.map((c) => c.code)).toEqual(["ArrowLeft", "KeyA"]);
    expect(d.panDown.map((c) => c.code)).toEqual(["ArrowDown", "KeyS"]);
    expect(d.panRight.map((c) => c.code)).toEqual(["ArrowRight", "KeyD"]);
    expect(d.camSave1).toEqual([{ code: "F2", shift: true }]);
    expect(d.camGo3).toEqual([{ code: "F4" }]);
    expect(d.factory1).toEqual([{ code: FACTORY_ROW[0] }]);
    expect(d.factory11).toEqual([]);
  });

  it("QWERTY : flèches seules, A reste l'attaque", () => {
    const d = defaultBindings(detectLayout(QWERTY_MAP));
    expect(d.attackMove).toEqual([{ code: "KeyA" }]);
    expect(d.panLeft).toEqual([{ code: "ArrowLeft" }]);
    expect(d.panUp).toEqual([{ code: "ArrowUp" }]);
    expect(d.zoomOut.map((c) => c.code)).toEqual(["NumpadSubtract", "Minus", "PageDown"]);
  });

  it("chaque action a au moins une touche, sauf les emplacements d'usine au-delà de la rangée", () => {
    for (const map of [AZERTY_MAP, QWERTY_MAP, QWERTZ_MAP]) {
      const d = defaultBindings(detectLayout(map));
      for (const a of ACTIONS) {
        const n = a.id.startsWith("factory") ? Number(a.id.slice(7)) : 0;
        if (n > FACTORY_ROW.length) continue;
        expect(d[a.id]?.length, a.id).toBeGreaterThan(0);
        for (const c of d[a.id]) expect(reservedReason(c), a.id).toBeNull();
      }
    }
  });

  it("aucun conflit par défaut (seule la rangée de l'usine masque une touche globale)", () => {
    for (const map of [AZERTY_MAP, QWERTY_MAP, QWERTZ_MAP]) {
      const km = new Keymap(detectLayout(map));
      expect(km.conflicts().filter((c) => c.kind === "conflit")).toEqual([]);
    }
    const km = new Keymap(detectLayout(AZERTY_MAP));
    const masks = km.conflicts().filter((c) => c.kind === "masque");
    expect(masks.map((c) => [c.a, c.b])).toEqual([["factory3", "commander"]]);
    // le commandant garde une autre touche
    expect(km.get("commander").map((c) => c.code)).toContain("Home");
  });
});

describe("correspondance", () => {
  const az = new Keymap(detectLayout(AZERTY_MAP));
  const qw = new Keymap(detectLayout(QWERTY_MAP));

  it("touche physique et contexte", () => {
    expect(az.match(ev("KeyQ"), { units: true })?.id).toBe("attackMove");
    expect(az.match(ev("KeyQ"), {})).toBeNull(); // pas d'unité : rien
    expect(az.match(ev("KeyQ", { ctrlKey: true }), {})?.id).toBe("selectArmy");
    expect(qw.match(ev("KeyA"), { units: true })?.id).toBe("attackMove");
    expect(qw.match(ev("KeyQ"), { units: true })).toBeNull();
    expect(az.match(ev("F1"), {})?.id).toBe("help");
    expect(az.match(ev("KeyH"), {})?.id).toBe("help");
    expect(az.match(ev("KeyR"), { units: true })).toBeNull();
    expect(az.match(ev("KeyR"), { units: true, build: true })?.id).toBe("rotate");
  });

  it("modificateurs exacts, sauf Maj libre (zoom, usine)", () => {
    expect(az.match(ev("KeyP", { shiftKey: true }), { units: true })).toBeNull();
    expect(az.match(ev("F2"), {})?.id).toBe("camGo1");
    expect(az.match(ev("F2", { shiftKey: true }), {})?.id).toBe("camSave1");
    expect(az.match(ev("Equal", { shiftKey: true }), {})?.id).toBe("zoomIn"); // « + »
    expect(az.match(ev("KeyX", { shiftKey: true }), { factory: true })).toEqual({ id: "factory2", shift: true });
  });

  it("Tab : constructeur inactif suivant (Maj : précédent), dans tous les contextes ; O : statistiques", () => {
    for (const ctx of [{}, { units: true }, { factory: true }, { units: true, build: true }]) {
      expect(az.match(ev("Tab"), ctx)).toEqual({ id: "idleEngineer", shift: false });
      expect(qw.match(ev("Tab", { shiftKey: true }), ctx)).toEqual({ id: "idleEngineer", shift: true });
    }
    expect(az.match(ev("Tab", { ctrlKey: true }), {})).toBeNull(); // Ctrl+Tab reste au navigateur
    expect(az.match(ev("KeyO"), {})?.id).toBe("stats");
  });

  it("l'usine sélectionnée l'emporte sur la touche globale", () => {
    expect(az.match(ev("KeyC"), {})?.id).toBe("commander");
    expect(az.match(ev("KeyC"), { factory: true })?.id).toBe("factory3");
    expect(az.match(ev("Home"), { factory: true })?.id).toBe("commander");
  });

  it("touches maintenues pour le défilement", () => {
    expect(az.held("panUp", new Set(["KeyW"]))).toBe(true);
    expect(az.held("panUp", new Set(["KeyZ"]))).toBe(false);
    expect(qw.held("panLeft", new Set(["KeyA"]))).toBe(false);
    expect(qw.held("panLeft", new Set(["ArrowLeft"]))).toBe(true);
  });

  it("groupes : chiffre physique, Maj ou Ctrl pour créer", () => {
    // AZERTY : la touche « 1 » donne « & », mais son code reste Digit1
    expect(groupKey(ev("Digit1"))).toEqual({ n: 1, create: false });
    expect(groupKey(ev("Digit1", { shiftKey: true }))).toEqual({ n: 1, create: true });
    expect(groupKey(ev("Digit3", { ctrlKey: true }))).toEqual({ n: 3, create: true });
    expect(groupKey(ev("Numpad7"))).toEqual({ n: 7, create: false });
    expect(groupKey(ev("Digit1", { altKey: true }))).toBeNull();
    expect(groupKey(ev("KeyA"))).toBeNull();
    expect(digitOf("Digit0")).toBe(10);
    expect(digitOf("Numpad4")).toBe(4);
    expect(digitOf("KeyB")).toBeNull();
  });
});

describe("personnalisation", () => {
  it("réassigne, signale les conflits, réinitialise", () => {
    const km = new Keymap(detectLayout(QWERTY_MAP));
    // WASD sur QWERTY : A sert alors à gauche et à l'attaque
    km.assign("panLeft", 1, { code: "KeyA" });
    expect(km.get("panLeft").map((c) => c.code)).toEqual(["ArrowLeft", "KeyA"]);
    const c = km.conflictsOf("panLeft");
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ kind: "conflit", chord: { code: "KeyA" } });
    expect([c[0].a, c[0].b].sort()).toEqual(["attackMove", "panLeft"]);
    // l'attaque déplacée : plus de conflit
    km.assign("attackMove", 0, { code: "KeyQ" });
    expect(km.conflicts().filter((x) => x.kind === "conflit")).toEqual([]);
    expect(km.match(ev("KeyQ"), { units: true })?.id).toBe("attackMove");
    km.remove("panLeft", 1);
    expect(km.isDefault("panLeft")).toBe(true);
    km.reset();
    expect(km.get("attackMove")).toEqual([{ code: "KeyA" }]);
  });

  it("deux unités et l'usine ne se gênent pas ; Maj+touche ne gêne pas une action à Maj libre", () => {
    const km = new Keymap(detectLayout(QWERTY_MAP));
    km.assign("factory1", 0, { code: "KeyA" }); // usine vs unités : jamais actifs ensemble
    expect(km.conflicts().filter((x) => x.kind === "conflit")).toEqual([]);
    km.assign("stats", 0, { code: "Equal", shift: true }); // « + » pris par le zoom (Maj libre)
    expect(km.conflictsOf("stats").map((x) => x.kind)).toEqual(["conflit"]);
  });

  it("enregistre seulement les changements, et relit en ignorant le reste", () => {
    const st = memStorage();
    const km = new Keymap(detectLayout(AZERTY_MAP));
    km.assign("stop", 0, { code: "KeyS", ctrl: true });
    km.save(st);
    expect(JSON.parse(st.m.get(STORAGE_KEY)!)).toEqual({ stop: [{ code: "KeyS", ctrl: true }] });
    const km2 = new Keymap(detectLayout(AZERTY_MAP));
    km2.load(st);
    expect(km2.match(ev("KeyS", { ctrlKey: true }), { units: true })?.id).toBe("stop");
    km2.reset();
    km2.save(st);
    expect(st.m.has(STORAGE_KEY)).toBe(false);
    // contenu illisible, action inconnue, touche réservée : ignorés sans erreur
    const bad = new Keymap(detectLayout(AZERTY_MAP));
    bad.load(memStorage({ [STORAGE_KEY]: "{pas du json" }));
    expect(bad.isDefault("stop")).toBe(true);
    bad.load(memStorage({ [STORAGE_KEY]: JSON.stringify({ inconnue: [{ code: "KeyK" }], stop: [{ code: "Digit1" }, { code: "KeyK" }] }) }));
    expect(bad.get("stop")).toEqual([{ code: "KeyK" }]);
    // stockage qui lève une exception
    const throwing = { getItem: () => { throw new Error("refusé"); }, setItem: () => { throw new Error("refusé"); }, removeItem: () => { throw new Error("refusé"); } };
    expect(() => bad.load(throwing)).not.toThrow();
    expect(() => bad.save(throwing)).not.toThrow();
  });

  it("refuse Échap, les chiffres et les modificateurs seuls", () => {
    expect(reservedReason({ code: "Escape" })).toMatch(/Échap/);
    expect(reservedReason({ code: "Digit4", shift: true })).toMatch(/groupes/);
    expect(reservedReason({ code: "Numpad1" })).toMatch(/groupes/);
    expect(reservedReason({ code: "ShiftLeft" })).not.toBeNull();
    expect(reservedReason({ code: "KeyK" })).toBeNull();
  });

  it("apprend la disposition à la frappe quand le navigateur ne la donne pas", () => {
    const km = new Keymap(detectLayout(null, "en-US"));
    expect(km.layout.kind).toBe("qwerty");
    expect(km.observe({ ...ev("KeyQ"), key: "a" })).toBe(true);
    expect(km.observe({ ...ev("KeyW"), key: "z" })).toBe(true);
    expect(km.layout.kind).toBe("azerty");
    expect(km.get("attackMove")).toEqual([{ code: "KeyQ" }]);
    expect(km.label({ code: "KeyQ" })).toBe("A");
    expect(km.observe({ ...ev("KeyQ"), key: "a" })).toBe(false);
    // avec la carte du navigateur, rien à apprendre
    const api = new Keymap(detectLayout(QWERTY_MAP));
    expect(api.observe({ ...ev("KeyQ"), key: "a" })).toBe(false);
  });

  it("l'aide suit les touches actuelles", () => {
    const km = new Keymap(detectLayout(AZERTY_MAP));
    const rows = helpRows(km);
    expect(rows.find((r) => r.label === "Attaque en mouvement")?.keys).toBe("A");
    expect(rows.find((r) => r.label === "Défiler vers le haut")?.keys).toBe("↑ / Z");
    expect(rows.some((r) => r.keys.startsWith("B, 1…6"))).toBe(true);
    km.assign("attackMove", 0, { code: "KeyK", shift: true });
    expect(helpRows(km).find((r) => r.label === "Attaque en mouvement")?.keys).toBe("Maj+K");
  });
});
