<script lang="ts">
  import { ui } from "../game/state.svelte.ts";
  import { client } from "../game/client.ts";
  import Lobby from "./Lobby.svelte";
  import Game from "./Game.svelte";

  let name = $state(localStorage.getItem("supreme.name") ?? "");
  function go(e: Event) {
    e.preventDefault();
    if (!name.trim()) return;
    client.connect(name.trim().slice(0, 20));
    ui.screen = "lobby";
  }
  // reconnexion automatique si le pseudo est connu
  if (name && !new URLSearchParams(location.search).has("nouveau")) {
    client.connect(name);
    ui.screen = "lobby";
  }
</script>

<Game />

{#if ui.screen === "connect"}
  <div class="center">
    <form class="panel card" onsubmit={go}>
      <h1>Suprématie</h1>
      <p class="dim">Stratégie en temps réel · usines et armées</p>
      <label>Pseudo <input bind:value={name} maxlength="20" autofocus /></label>
      <button type="submit" disabled={!name.trim()}>Entrer</button>
    </form>
  </div>
{:else if ui.screen === "lobby"}
  <Lobby />
{:else if ui.screen === "loading"}
  <div class="center"><div class="panel card"><h2>Chargement de la partie…</h2><p class="dim">Génération de la carte et du terrain</p></div></div>
{/if}

{#if ui.error}
  <div class="err panel">{ui.error}</div>
{/if}

<style>
  .center { position: fixed; inset: 0; display: grid; place-items: center; z-index: 30; background: radial-gradient(circle at 50% 40%, #1a2a3a, #0a0f14 70%); }
  .card { padding: 26px 32px; display: flex; flex-direction: column; gap: 12px; min-width: 320px; }
  h1 { margin: 0; font-size: 30px; letter-spacing: 2px; }
  h2 { margin: 0; }
  label { display: flex; flex-direction: column; gap: 4px; }
  .err { position: fixed; top: 10px; left: 50%; transform: translateX(-50%); padding: 8px 14px; color: var(--bad); z-index: 99; }
</style>
