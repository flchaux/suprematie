<script lang="ts">
  import { onMount } from "svelte";
  import { ui } from "../game/state.svelte.ts";
  import { client } from "../game/client.ts";
  import TopBar from "./TopBar.svelte";
  import BuildBar from "./BuildBar.svelte";
  import Selection from "./Selection.svelte";
  import Research from "./Research.svelte";
  import Stats from "./Stats.svelte";
  import Help from "./Help.svelte";

  let view: HTMLDivElement;
  let box: HTMLDivElement;
  let mini = $state<HTMLCanvasElement>();
  $effect(() => {
    if (mini) client.attachMinimap(mini);
  });
  let chatText = $state("");
  let now = $state(performance.now());
  onMount(() => {
    client.attach(view, box);
    const t = setInterval(() => (now = performance.now()), 1000);
    return () => clearInterval(t);
  });
  function sendChat(e: Event) {
    e.preventDefault();
    client.chat(chatText);
    chatText = "";
    ui.chatOpen = false;
  }
  const MODE_LABEL: Record<string, string> = {
    attackMove: "Attaque en mouvement : cliquez une destination",
    patrol: "Patrouille : cliquez une destination",
    reclaim: "Recyclage : cliquez une épave ou un de vos bâtiments",
    assist: "Escorte / assistance : cliquez une unité ou un bâtiment",
    unload: "Déchargement : cliquez la destination",
    teleport: "Téléportation : cliquez la destination",
    jump: "Saut hyperespace : cliquez une balise",
    launch: "Missile stratégique : cliquez la cible",
    fire: "Canon orbital : cliquez la cible",
    transfer: "Transfert : cliquez la plateforme d'arrivée",
    link: "Liaison : cliquez l'autre porte",
    attackGround: "Tir au sol : cliquez la cible",
    build: "Construction : clic gauche pour poser (glisser pour une ligne), R pour tourner, clic droit pour annuler",
  };
</script>

<div class="game" class:hidden={ui.screen !== "game"}>
  <div class="view" bind:this={view}></div>
  <div class="selbox" bind:this={box}></div>
  {#if ui.screen === "game"}
    <TopBar />
    <div class="bottom">
      <div class="panel minimap"><canvas bind:this={mini} width="220" height="220"></canvas></div>
      <Selection />
      {#if ui.canBuild}<BuildBar />{/if}
    </div>
    {#if ui.mode}
      <div class="mode panel">{MODE_LABEL[ui.mode] ?? ui.mode} <span class="dim">(Échap pour annuler)</span></div>
    {/if}
    <div class="messages">
      {#each ui.messages.filter((m) => now - m.time < 10000) as m (m.id)}
        <div class="msg {m.kind}">{m.text}</div>
      {/each}
    </div>
    {#if ui.chatOpen}
      <form class="chat panel" onsubmit={sendChat}>
        <input bind:value={chatText} placeholder="Message à tous (Entrée)" autofocus onkeydown={(e) => e.key === "Escape" && (ui.chatOpen = false)} />
      </form>
    {/if}
    {#if ui.waiting.length}
      <div class="waiting panel">En attente de : {ui.waiting.join(", ")}</div>
    {/if}
    {#if ui.replay}
      <div class="replay panel">
        Replay ·
        {#each [0, 1, 2, 4, 8, 16] as s}
          <button class:on={ui.replaySpeed === s} onclick={() => client.setReplaySpeed(s)}>{s === 0 ? "Pause" : "×" + s}</button>
        {/each}
        <span class="dim">tick {ui.tick}</span>
      </div>
    {/if}
    {#if ui.showResearch}<Research />{/if}
    {#if ui.showStats}<Stats />{/if}
    {#if ui.showHelp}<Help />{/if}
    {#if ui.gameOver}
      <div class="end panel">
        {#if ui.spectator}
          <h1>Fin de la partie</h1>
          <p>Équipe gagnante : {ui.gameOver.winner >= 0 ? "Équipe " + (ui.gameOver.winner + 1) : "aucune"}</p>
        {:else}
          <h1 class={ui.gameOver.won ? "good" : "bad"}>{ui.gameOver.won ? "Victoire" : "Défaite"}</h1>
        {/if}
        <table>
          <thead><tr><th>Joueur</th><th>Équipe</th><th>Unités</th><th>Destructions</th><th>Pertes</th></tr></thead>
          <tbody>
            {#each ui.players as p}
              <tr><td class:dim={!p.alive}>{p.name}</td><td>{p.team + 1}</td><td>{p.units}</td><td>{p.kills}</td><td>{p.losses}</td></tr>
            {/each}
          </tbody>
        </table>
        <div class="row">
          {#if ui.gameOver.replay}<a href={ui.gameOver.replay} download><button>Télécharger le replay</button></a>{/if}
          <button onclick={() => (ui.gameOver = null)}>Continuer à regarder</button>
          <button onclick={() => location.reload()}>Retour au salon</button>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .game { position: fixed; inset: 0; }
  .game.hidden { visibility: hidden; }
  .view { position: absolute; inset: 0; }
  .selbox { position: absolute; display: none; border: 1px solid #7dff9a; background: rgba(125, 255, 154, 0.08); pointer-events: none; }
  .bottom { position: absolute; left: 6px; right: 6px; bottom: 6px; display: flex; gap: 6px; align-items: flex-end; pointer-events: none; }
  .bottom > :global(*) { pointer-events: auto; }
  .minimap { padding: 3px; line-height: 0; }
  .minimap canvas { width: 220px; height: 220px; cursor: crosshair; image-rendering: pixelated; }
  .mode { position: absolute; top: 48px; left: 50%; transform: translateX(-50%); padding: 5px 12px; }
  .messages { position: absolute; left: 8px; bottom: 250px; display: flex; flex-direction: column; gap: 3px; pointer-events: none; max-width: 480px; }
  .msg { background: var(--bg); padding: 3px 8px; border-radius: 4px; border-left: 3px solid var(--accent); }
  .msg.alert { border-color: var(--bad); }
  .msg.good { border-color: var(--good); }
  .msg.chat { border-color: var(--warn); }
  .chat { position: absolute; left: 8px; bottom: 236px; padding: 4px; }
  .chat input { width: 380px; }
  .waiting { position: absolute; top: 90px; left: 50%; transform: translateX(-50%); padding: 8px 16px; color: var(--warn); }
  .replay { position: absolute; top: 48px; right: 10px; padding: 5px 8px; display: flex; gap: 4px; align-items: center; }
  .end { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); padding: 20px 30px; z-index: 40; display: flex; flex-direction: column; gap: 10px; align-items: center; }
  .end h1 { margin: 0; font-size: 36px; }
  .end table { border-collapse: collapse; }
  .end td, .end th { padding: 3px 10px; text-align: left; }
  .row { display: flex; gap: 8px; }
</style>
