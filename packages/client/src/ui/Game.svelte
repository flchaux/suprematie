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
  import Icon from "./Icon.svelte";
  import EndReport from "./EndReport.svelte";
  import { keyOf } from "../game/keys.svelte.ts";
  import Plans from "./Plans.svelte";
  import { plans } from "../game/plans.svelte.ts";

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
  const MODE_LABEL: Record<string, [string, string]> = {
    attackMove: ["attack", "Attaque en mouvement : cliquez une destination"],
    patrol: ["patrol", "Patrouille : cliquez une destination"],
    reclaim: ["reclaim", "Recyclage : cliquez une épave ou un de vos bâtiments"],
    assist: ["assist", "Escorte / assistance : cliquez une unité ou un bâtiment"],
    unload: ["unload", "Déchargement : cliquez la destination"],
    teleport: ["teleport", "Téléportation : cliquez la destination"],
    jump: ["jump", "Saut hyperespace : cliquez une balise"],
    launch: ["target", "Missile stratégique : cliquez la cible"],
    fire: ["target", "Canon orbital : cliquez la cible"],
    transfer: ["teleport", "Transfert : cliquez la plateforme d'arrivée"],
    link: ["link", "Liaison : cliquez la destination (porte, gare ou héliport, le vôtre ou celui d'un allié)"],
    attackGround: ["ground", "Tir au sol : cliquez la cible"],
    build: ["production", "Construction : clic gauche pour poser (glisser pour une ligne), clic droit pour annuler"],
    copy: ["copy", "Copie : glissez un cadre sur vos bâtiments terminés, clic droit pour annuler"],
    paste: ["paste", "Plan : clic gauche pour construire (Maj : garder l'outil), clic droit pour annuler"],
  };
  const MSG_ICON: Record<string, string> = { alert: "alert", good: "check", chat: "chat", info: "flag" };
</script>

<div class="game" class:hidden={ui.screen !== "game"}>
  <div class="view" bind:this={view}></div>
  <div class="selbox" bind:this={box}></div>
  {#if ui.screen === "game"}
    <div class="vignette"></div>
    <TopBar />
    <div class="bottom">
      <div class="panel minimap">
        <canvas bind:this={mini} width="220" height="220"></canvas>
        <span class="corner tl"></span><span class="corner br"></span>
      </div>
      <Selection />
      {#if ui.canBuild}<BuildBar />{/if}
    </div>
    {#if ui.mode}
      {@const m = MODE_LABEL[ui.mode]}
      <div class="mode panel"><Icon name={m?.[0] ?? "target"} size={15} /> {m?.[1] ?? ui.mode}{#if (ui.mode === "build" || ui.mode === "paste") && keyOf("rotate")}, {keyOf("rotate")} pour tourner{/if}{#if plans.status && (ui.mode === "copy" || ui.mode === "paste")} <b class="num nowrap">· {plans.status}</b>{/if} <span class="key">Échap</span></div>
    {/if}
    <div class="messages">
      {#each ui.messages.filter((m) => now - m.time < 10000) as m (m.id)}
        <div class="msg {m.kind}"><Icon name={MSG_ICON[m.kind] ?? "flag"} size={14} /><span>{m.text}</span></div>
      {/each}
    </div>
    {#if ui.chatOpen}
      <form class="chatbox panel" onsubmit={sendChat}>
        <Icon name="chat" size={15} />
        <input bind:value={chatText} placeholder="Message à tous (Entrée)" autofocus onkeydown={(e) => e.key === "Escape" && (ui.chatOpen = false)} />
      </form>
    {/if}
    {#if ui.waiting.length}
      <div class="waiting panel"><span class="dot"></span> En attente de : {ui.waiting.join(", ")}</div>
    {/if}
    {#if ui.showPerf}
      <div class="perfbox panel num">
        <div class="kicker">Performances {#if keyOf("perf")}<span class="key">{keyOf("perf")}</span>{/if}</div>
        <div><b>{ui.fps}</b> images/s · {ui.perf.frameMs.toFixed(1)} ms par image</div>
        <div>Rendu (processeur) : {ui.perf.cpuMs.toFixed(1)} ms</div>
        <div>Appels de dessin : {ui.perf.drawCalls} · triangles : {(ui.perf.triangles / 1000).toFixed(0)} k</div>
        <div>Particules : {ui.perf.particles}</div>
        <div>Moteur : {ui.backend} · ombres {ui.gfx.shadows ? `${Math.round(ui.perf.shadowSize)} cases` : "désactivées"} · halo {ui.gfx.bloom ? "oui" : "non"} · textures {ui.gfx.textures ? "oui" : "non"}</div>
      </div>
    {/if}
    {#if ui.replay}
      <div class="replay panel">
        <span class="kicker">Replay</span>
        {#each [0, 1, 2, 4, 8, 16] as s}
          <button class:on={ui.replaySpeed === s} onclick={() => client.setReplaySpeed(s)}>{#if s === 0}<Icon name="pause" size={13} />{:else}<span class="num">×{s}</span>{/if}</button>
        {/each}
        <span class="dim num">tick {ui.tick}</span>
      </div>
    {/if}
    {#if ui.showResearch}<Research />{/if}
    {#if ui.showStats}<Stats />{/if}
    {#if ui.showHelp}<Help />{/if}
    {#if plans.show}<Plans />{/if}
    {#if ui.gameOver}<EndReport />{/if}
  {/if}
</div>

<style>
  .game { position: fixed; inset: 0; }
  .game.hidden { visibility: hidden; }
  .view { position: absolute; inset: 0; }
  .vignette { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse at 50% 50%, transparent 62%, rgba(2, 5, 9, 0.5) 100%); }
  .selbox { position: absolute; display: none; border: 1px solid var(--accent); background: rgba(62, 240, 255, 0.07); box-shadow: 0 0 12px rgba(62, 240, 255, 0.35), inset 0 0 18px rgba(62, 240, 255, 0.08); pointer-events: none; }
  .bottom { position: absolute; left: 8px; right: 8px; bottom: 8px; display: flex; gap: 8px; align-items: flex-end; pointer-events: none; }
  .bottom > :global(*) { pointer-events: auto; }
  .minimap { padding: 5px; line-height: 0; flex-shrink: 0; }
  .minimap canvas { width: 220px; height: 220px; cursor: crosshair; image-rendering: pixelated; }
  .corner { position: absolute; width: 14px; height: 14px; border-color: var(--accent); border-style: solid; pointer-events: none; filter: drop-shadow(0 0 4px var(--accent)); }
  .corner.tl { top: 3px; left: 3px; border-width: 2px 0 0 2px; }
  .corner.br { bottom: 3px; right: 3px; border-width: 0 2px 2px 0; }
  .mode { position: absolute; top: 60px; left: 50%; transform: translateX(-50%); padding: 7px 14px; display: flex; align-items: center; gap: 8px; color: var(--accent); }
  .mode :global(.key) { margin-left: 4px; }
  .nowrap { white-space: nowrap; }
  .messages { position: absolute; left: 10px; bottom: 252px; display: flex; flex-direction: column; gap: 4px; pointer-events: none; max-width: 480px; }
  .msg {
    display: flex; align-items: center; gap: 8px; padding: 5px 12px 5px 9px;
    background: linear-gradient(90deg, rgba(10, 20, 30, 0.92), rgba(10, 20, 30, 0.6));
    border-left: 2px solid var(--accent); color: var(--text);
    animation: slide 0.2s ease-out;
  }
  .msg :global(.ic) { color: var(--accent); }
  .msg.alert { border-color: var(--bad); }
  .msg.alert :global(.ic) { color: var(--bad); }
  .msg.good { border-color: var(--good); }
  .msg.good :global(.ic) { color: var(--good); }
  .msg.chat { border-color: var(--amber); }
  .msg.chat :global(.ic) { color: var(--amber); }
  .chatbox { position: absolute; left: 10px; bottom: 238px; padding: 6px 8px; display: flex; align-items: center; gap: 8px; color: var(--amber); }
  .chatbox input { width: 380px; }
  .waiting { position: absolute; top: 104px; left: 50%; transform: translateX(-50%); padding: 9px 16px; color: var(--warn); display: flex; align-items: center; gap: 9px; }
  .dot { width: 8px; height: 8px; background: var(--amber); box-shadow: 0 0 10px var(--amber); animation: blink 1.2s infinite; }
  .replay { position: absolute; top: 60px; right: 10px; padding: 6px 10px; display: flex; gap: 4px; align-items: center; }
  .replay button { padding: 3px 8px; min-width: 34px; display: inline-flex; justify-content: center; }
  .perfbox { position: absolute; top: 60px; left: 10px; padding: 9px 12px; font-size: 11.5px; display: flex; flex-direction: column; gap: 3px; pointer-events: none; }
  @keyframes slide { from { opacity: 0; transform: translateX(-10px); } }
  @keyframes blink { 50% { opacity: 0.3; } }
</style>
