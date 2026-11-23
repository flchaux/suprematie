import { mount } from "svelte";
import App from "./ui/App.svelte";
import "./ui/style.css";
import { installTooltips, setItemTips } from "./ui/tooltips.ts";
import { itemTip } from "./game/itemDescs.ts";

installTooltips();
setItemTips((id, named) => (ui.data ? itemTip(ui.data, id, ui.race, named) : ""));

mount(App, { target: document.getElementById("app")! });

// accès pour les tests automatisés (Playwright)
import { client } from "./game/client.ts";
import { ui } from "./game/state.svelte.ts";
import { kb, keymap } from "./game/keys.svelte.ts";
import { plans } from "./game/plans.svelte.ts";
import { musicPlaying, musicState, skipMusic } from "./audio/music.ts";
(window as unknown as { __game: unknown }).__game = { client, ui, kb, keymap, plans, musicPlaying, musicState, skipMusic };
