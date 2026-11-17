<script lang="ts">
  import { ui } from "../game/state.svelte.ts";
  import { client } from "../game/client.ts";
  import Lobby from "./Lobby.svelte";
  import Game from "./Game.svelte";
  import Icon from "./Icon.svelte";
  import { sprite } from "./sprites.ts";

  let name = $state(localStorage.getItem("supreme.name") ?? "");
  const keyart = sprite("art", "keyart");
  const emblem = sprite("art", "emblem");
  const bg = keyart ? `--keyart: url(${keyart})` : "";
  function go(e: Event) {
    e.preventDefault();
    if (!name.trim()) return;
    client.connect(name.trim().slice(0, 20));
    ui.screen = "lobby";
  }
  // mode démo local (?demo), sinon reconnexion automatique si le pseudo est connu
  if (new URLSearchParams(location.search).has("demo")) {
    client.startDemo();
  } else if (name && !new URLSearchParams(location.search).has("nouveau")) {
    client.connect(name);
    ui.screen = "lobby";
  }
</script>

<Game />

{#if ui.screen === "connect"}
  <div class="screen" style={bg}>
    <form class="panel card" onsubmit={go}>
      <div class="brand">
        {#if emblem}<img src={emblem} alt="" />{/if}
        <div>
          <h1>Suprématie</h1>
          <div class="kicker">Stratégie en temps réel · usines et armées</div>
        </div>
      </div>
      <label class="field">
        <span class="kicker">Indicatif du commandant</span>
        <input bind:value={name} maxlength="20" autofocus placeholder="Votre pseudo" />
      </label>
      <button type="submit" class="primary" disabled={!name.trim()}>Entrer dans le salon</button>
      <p class="dim small foot"><Icon name="alert" size={13} /> Jusqu'à 8 joueurs et IA · Chrome recommandé</p>
    </form>
  </div>
{:else if ui.screen === "lobby"}
  <Lobby />
{:else if ui.screen === "loading"}
  <div class="screen" style={bg}>
    <div class="panel card loading">
      <div class="brand">
        {#if emblem}<img src={emblem} alt="" class="spin" />{/if}
        <div>
          <div class="kicker">Déploiement</div>
          <h2>Chargement de la partie</h2>
        </div>
      </div>
      <div class="bar scan"><div></div></div>
      <p class="dim">Génération de la carte et du terrain…</p>
    </div>
  </div>
{/if}

{#if ui.error}
  <div class="err panel"><Icon name="alert" size={15} /> {ui.error}</div>
{/if}

<style>
  .card { padding: 30px 36px 24px; display: flex; flex-direction: column; gap: 18px; width: min(440px, calc(100vw - 32px)); animation: rise 0.4s ease-out; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field input { font-size: 16px; padding: 9px 12px; }
  .primary { font-size: 14px; padding: 11px; }
  .foot { margin: 0; display: flex; align-items: center; gap: 6px; }
  h2 { margin: 2px 0 0; font-size: 18px; }
  .loading .bar { height: 6px; }
  .scan > div { width: 40%; animation: scan 1.4s ease-in-out infinite alternate; }
  .spin { animation: pulse 1.6s ease-in-out infinite; }
  .err { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); padding: 9px 16px; color: var(--bad); z-index: 99; display: flex; gap: 8px; align-items: center; }
  @keyframes rise { from { opacity: 0; transform: translateY(10px); } }
  @keyframes scan { from { margin-left: 0; } to { margin-left: 60%; } }
  @keyframes pulse { 50% { filter: drop-shadow(0 0 22px rgba(62, 240, 255, 0.8)); } }
</style>
