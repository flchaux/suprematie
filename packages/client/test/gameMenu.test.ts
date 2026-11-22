// Menu de partie (Échap) : Échap annule d'abord ce qui est en cours, entrées selon le rôle du joueur.
import { describe, it, expect } from "vitest";
import { escapeAction, menuItems, menuPauses, type EscapeState, type MenuRole } from "../src/game/gameMenu.ts";

const idle: EscapeState = { menuOpen: false, buildStep: false, mode: false, panel: false, selection: false };
const role = (r: Partial<MenuRole>): MenuRole => ({ solo: false, host: false, spectator: false, replay: false, ended: false, ...r });
const enabled = (r: MenuRole) => menuItems(r).filter((i) => i.enabled).map((i) => i.id);

describe("Échap", () => {
  it("annule dans l'ordre : menu, construction, outil, panneaux, sélection", () => {
    expect(escapeAction({ ...idle, menuOpen: true, mode: true, selection: true })).toBe("closeMenu");
    expect(escapeAction({ ...idle, buildStep: true, mode: true })).toBe("buildStep");
    expect(escapeAction({ ...idle, mode: true, panel: true, selection: true })).toBe("mode");
    expect(escapeAction({ ...idle, panel: true, selection: true })).toBe("panels");
    expect(escapeAction({ ...idle, selection: true })).toBe("deselect");
  });
  it("n'ouvre le menu que s'il n'y a plus rien à annuler", () => {
    expect(escapeAction(idle)).toBe("openMenu");
  });
});

describe("menu de partie", () => {
  it("solo : tout est permis et le menu met en pause", () => {
    const r = role({ solo: true, host: true });
    expect(menuPauses(r)).toBe(true);
    expect(enabled(r)).toEqual(["resume", "save", "load", "options", "quit"]);
  });
  it("à plusieurs : l'hôte met en pause, charge et quitte (avec confirmation)", () => {
    const r = role({ host: true });
    expect(menuPauses(r)).toBe(true);
    expect(enabled(r)).toEqual(["resume", "save", "load", "options", "quit"]);
    const items = menuItems(r);
    expect(items.find((i) => i.id === "quit")!.confirm).toBe(true);
    expect(items.find((i) => i.id === "quit")!.hint).toMatch(/pour tous/);
  });
  it("à plusieurs, sans être l'hôte : pas de pause, ni charger ni quitter", () => {
    const r = role({});
    expect(menuPauses(r)).toBe(false);
    expect(enabled(r)).toEqual(["resume", "save", "options"]);
    expect(menuItems(r).find((i) => i.id === "quit")!.hint).toMatch(/hôte/);
  });
  it("spectateur : ni pause ni sauvegarde", () => {
    const r = role({ spectator: true, host: true });
    expect(menuPauses(r)).toBe(false);
    expect(enabled(r)).toEqual(["resume", "options"]);
  });
  it("replay : pause du replay, quitter sans confirmation", () => {
    const r = role({ replay: true });
    expect(menuPauses(r)).toBe(true);
    expect(enabled(r)).toEqual(["resume", "options", "quit"]);
    expect(menuItems(r).find((i) => i.id === "quit")!.confirm).toBe(false);
  });
  it("partie terminée : pas de pause, quitter reste possible", () => {
    const r = role({ ended: true });
    expect(menuPauses(r)).toBe(false);
    expect(enabled(r)).toContain("quit");
    expect(enabled(r)).not.toContain("save");
  });
});
