import { mount } from "svelte";
import App from "./ui/App.svelte";
import "./ui/style.css";

mount(App, { target: document.getElementById("app")! });

// accès pour les tests automatisés (Playwright)
import { client } from "./game/client.ts";
import { ui } from "./game/state.svelte.ts";
(window as unknown as { __game: unknown }).__game = { client, ui };
