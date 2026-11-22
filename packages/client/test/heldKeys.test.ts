// Défilement de la caméra au clavier : ce qui peut le couper (focus dans un champ, capture d'une
// touche) et ce qui ne doit plus le couper (discussion ouverte sans le focus, Ctrl resté « enfoncé »).
import { describe, it, expect } from "vitest";
import { Keymap, detectLayout } from "../src/game/keymap.ts";
import { isTextField, keyboardPan, keyboardPanAllowed, syncModifiers, type ModifierState } from "../src/game/heldKeys.ts";

const km = new Keymap(detectLayout(null, "fr-FR"));
const body = { tagName: "BODY" };
const chatInput = { tagName: "INPUT", type: "text" };
const released: ModifierState = { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };

describe("défilement au clavier", () => {
  it("ZQSD et flèches font défiler quand rien n'a le focus", () => {
    expect(keyboardPan(new Set(["KeyW"]), km, { focus: body, capturing: false })).toEqual([0, -1]);
    expect(keyboardPan(new Set(["ArrowRight", "KeyS"]), km, { focus: body, capturing: false })).toEqual([1, 1]);
  });

  it("discussion ouverte puis clic sur la carte : le champ perd le focus, le clavier refait défiler", () => {
    // Entrée ouvre la discussion, le champ a le focus : les touches lui appartiennent
    expect(keyboardPan(new Set(["KeyW"]), km, { focus: chatInput, capturing: false })).toEqual([0, 0]);
    // clic sur la carte : le focus revient au document, la boîte reste affichée (ui.chatOpen vrai),
    // ce qui coupait le défilement au clavier jusqu'à ce qu'on reclique dans le champ
    expect(keyboardPan(new Set(["KeyW"]), km, { focus: body, capturing: false })).toEqual([0, -1]);
  });

  it("écran « Raccourcis » en attente d'une touche : pas de défilement", () => {
    expect(keyboardPanAllowed({ focus: body, capturing: true })).toBe(false);
  });

  it("Ctrl dont le relâchement a été perdu ne bloque plus le défilement", () => {
    // Ctrl+F (barre de recherche du navigateur), AltGr… : le keyup de Ctrl n'arrive jamais à la page
    const keys = new Set(["ControlLeft", "KeyW"]);
    expect(keyboardPan(keys, km, { focus: body, capturing: false })).toEqual([0, 0]);
    // l'événement suivant (touche ou souris) dit Ctrl relâché : l'état est recalé
    syncModifiers(keys, released);
    expect([...keys]).toEqual(["KeyW"]);
    expect(keyboardPan(keys, km, { focus: body, capturing: false })).toEqual([0, -1]);
  });

  it("un modificateur réellement tenu est gardé", () => {
    const keys = new Set(["ControlLeft", "ShiftLeft", "AltRight"]);
    syncModifiers(keys, { ...released, ctrlKey: true, shiftKey: true });
    expect([...keys].sort()).toEqual(["ControlLeft", "ShiftLeft"]);
  });
});

describe("champs de saisie", () => {
  it("texte, zone de texte, liste déroulante : le clavier leur appartient", () => {
    expect(isTextField(chatInput)).toBe(true);
    expect(isTextField({ tagName: "INPUT" })).toBe(true);
    expect(isTextField({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTextField({ tagName: "SELECT" })).toBe(true);
    expect(isTextField({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });
  it("case à cocher, curseur, bouton, document : non", () => {
    for (const type of ["checkbox", "range", "button"]) expect(isTextField({ tagName: "INPUT", type })).toBe(false);
    expect(isTextField({ tagName: "BUTTON" })).toBe(false);
    expect(isTextField(body)).toBe(false);
    expect(isTextField(null)).toBe(false);
  });
});
