<script lang="ts">
  import { onMount } from "svelte";
  import { BClass, SEVE } from "@supreme/shared";
  import { ui } from "../game/state.svelte.ts";
  import { client } from "../game/client.ts";
  import TopBar from "./TopBar.svelte";
  import BuildBar from "./BuildBar.svelte";
  import Selection from "./Selection.svelte";
  import Upgrades from "./Upgrades.svelte";
  import Research from "./Research.svelte";
  import Stats from "./Stats.svelte";
  import Help from "./Help.svelte";
  import Recipes from "./Recipes.svelte";
  import Icon from "./Icon.svelte";
  import Item from "./Item.svelte";
  import SplitIcon from "./SplitIcon.svelte";
  import EndReport from "./EndReport.svelte";
  import GameMenu from "./GameMenu.svelte";
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
    reclaim: ["reclaim", "Recyclage : cliquez une épave ou un de vos bâtiments, ou glissez un cadre pour tout recycler dans la zone"],
    assist: ["assist", "Escorte / assistance : cliquez une unité ou un bâtiment"],
    unload: ["unload", "Déchargement : cliquez la destination"],
    ferryFrom: ["ferry", "Navette : cliquez le point d'embarquement (les unités de combat qui y attendent sont prises)"],
    ferryTo: ["ferry", "Navette : cliquez le point de débarquement"],
    ping: ["ping", "Ping : cliquez le point à signaler à votre équipe, sur la carte ou la minicarte"],
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
  /** notre Arche sélectionnée seule : ses améliorations */
  const arkMods = $derived(ui.me >= 0 && ui.selForeign < 0 && ui.selUnits.length === 1 && ui.unitInfo?.mods?.ark ? ui.unitInfo.mods : null);
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
        {#if ui.me >= 0}<button class="pingbtn" class:on={ui.mode === "ping"} title={`Ping : signaler un point à votre équipe${keyOf("ping") ? ` (${keyOf("ping")} : sous la souris)` : ""}, ou Alt+clic`} onclick={() => (ui.mode === "ping" ? client.cancelMode() : client.setMode("ping"))}><Icon name="ping" size={15} /></button>{/if}
        <span class="corner tl"></span><span class="corner br"></span>
      </div>
      <Selection />
      <!-- Arche des Transhumants : ses améliorations à la place du menu de construction (la race ne construit pas) -->
      {#if arkMods}<div class="panel arkpanel"><Upgrades mi={arkMods} refs={ui.selUnits[0].ids} /></div>{:else if ui.canBuild}<BuildBar />{/if}
    </div>
    {#if ui.mode}
      {@const m = MODE_LABEL[ui.mode]}
      <div class="mode panel"><Icon name={m?.[0] ?? "target"} size={15} /> {m?.[1] ?? ui.mode}{#if (ui.mode === "build" || ui.mode === "paste") && keyOf("rotate")}, {keyOf("rotate")} pour tourner{#if ui.mode === "build" && ui.data?.buildings[ui.buildKind]?.cls === BClass.Belt} (direction et virages automatiques d'après les tapis voisins ; {keyOf("rotate")} force la direction){/if}{/if}{#if ui.mode === "build" && ([BClass.Belt, BClass.Router, BClass.Inserter] as number[]).includes(ui.data?.buildings[ui.buildKind]?.cls ?? -1)}. Peut remplacer vos tapis{/if}{#if ui.mode === "build" && ui.grass}<b class="num nowrap" class:bad={ui.grass.left < 25}>· herbe à manger : {ui.grass.left} cases{ui.grass.left ? ` (≈ ${Math.max(1, Math.round((ui.grass.left * ui.grass.secs) / 60))} min)` : ", il n'y en a plus ici"}</b>{/if}{#if ui.mode === "build" && ui.lineCost}<b class="num nowrap linecost">· {ui.lineCost.n} {ui.data?.buildings[ui.buildKind]?.name.toLowerCase() ?? ""}{ui.lineCost.n > 1 ? "s" : ""} : {#each ui.lineCost.cost as [it, n]}<span class:bad={n > (it === SEVE ? ui.seve : ui.sels)}><Item id={it} {n} size={15} /></span>{/each}{#if ui.lineCost.pct}<span class="dim">(+{ui.lineCost.pct} %{ui.lineCost.n > 1 ? " au plus loin" : ""})</span>{/if}</b>{/if}{#if plans.status && (ui.mode === "copy" || ui.mode === "paste")} <b class="num nowrap">· {plans.status}</b>{/if} <span class="key">Échap</span></div>
    {/if}
    <div class="messages">
      {#each ui.messages.filter((m) => now - m.time < 10000) as m (m.id)}
        <div class="msg {m.kind}"><Icon name={MSG_ICON[m.kind] ?? "flag"} size={14} /><span>{m.text}</span></div>
      {/each}
    </div>
    {#if ui.chatOpen}
      <form class="chatbox panel" onsubmit={sendChat}>
        <Icon name="chat" size={15} />
        <input bind:value={chatText} placeholder="Message à tous (Entrée)" autofocus onkeydown={(e) => e.key === "Escape" && (ui.chatOpen = false)} onblur={() => !chatText.trim() && (ui.chatOpen = false)} />
      </form>
    {/if}
    {#if ui.speed === 0 && !ui.replay && !ui.menuOpen}
      <div class="pausebar panel"><Icon name="pause" size={14} /> Partie en pause{#if ui.pausedBy}<span class="dim">&nbsp;· par {ui.pausedBy}</span>{/if}{#if client.canPause()}<button class="ghost" onclick={() => client.togglePause()}><Icon name="play" size={12} /> Reprendre{#if keyOf("pause")} <span class="key">{keyOf("pause")}</span>{/if}</button>{/if}</div>
    {/if}
    {#if ui.menuOpen}<GameMenu />{/if}
    {#if ui.waiting.length}
      <div class="waiting panel"><span class="dot"></span> En attente de : {ui.waiting.join(", ")}</div>
    {/if}
    {#if ui.showPerf}
      <div class="perfbox panel num">
        <div class="kicker">Performances {#if keyOf("perf")}<span class="key">{keyOf("perf")}</span>{/if}</div>
        <div><b>{ui.fps}</b> images/s · {ui.perf.frameMs.toFixed(1)} ms par image</div>
        <div>Rendu (processeur) : {ui.perf.cpuMs.toFixed(1)} ms</div>
        <div>Appels de dessin : {ui.perf.drawCalls} · triangles : {(ui.perf.triangles / 1000).toFixed(0)} k</div>
        <div>Particules : {ui.perf.particles} · décorations : {ui.perf.decor}</div>
        <div>Moteur : {ui.backend} · ombres {ui.gfx.shadows ? `${Math.round(ui.perf.shadowSize)} cases` : "désactivées"} · halo {ui.gfx.bloom ? "oui" : "non"} · textures {ui.gfx.textures ? "oui" : "non"} · sol {ui.gfx.ground ? "détaillé" : "simple"}</div>
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
    {#if ui.showRecipes}<Recipes />{/if}
    {#if ui.logisticsView}
      <div class="logilegend panel">
        <span class="kicker">Vue logistique</span>
        <span><i style="background:#3f5273"></i>tapis vide</span><span><i style="background:#3fd27a"></i>fluide</span><span><i style="background:#e8c234"></i>chargé</span><span><i style="background:#ff3b2e"></i>saturé</span>
        <span class="sep"></span>
        <span><i style="background:#ff3b2e"></i>sortie bloquée</span><span><i style="background:#f0a020"></i>entrée manquante</span><span><i style="background:#b060ff"></i>énergie</span><span><i style="background:#3a9a52"></i>en marche</span>
      </div>
    {/if}
    {#if ui.powerView}
      {@const alive = ui.powerNets.filter((n) => !n.dead)}
      {@const dead = ui.powerNets.filter((n) => n.dead).length}
      <div class="powerlegend panel">
        <span class="kicker">{ui.race === 1 ? "Vue des racines" : "Vue électrique"}</span>
        {#each alive as n (n.id)}
          <div class="pnet">
            <i style:background={"#" + n.color.toString(16).padStart(6, "0")}></i>
            {#if n.roots}
              <span class="num">sève {n.prod} · sels {n.demand}&nbsp;/&nbsp;{n.cap}</span>
            {:else}
            <span class="num">{n.demand}&nbsp;/&nbsp;{n.prod}&nbsp;kW</span>{#if n.sat < 1024}<span class="bad">&nbsp;·&nbsp;{Math.round((n.sat / 1024) * 100)}&nbsp;%</span>{/if}<span class="dim">&nbsp;·&nbsp;</span>{#if n.autonomy < 0}<span class="dim">rien ne brûle</span>{:else}<span class:warn={n.autonomy < 60} class="num">autonomie {n.autonomy >= 120 ? Math.round(n.autonomy / 60) + " min" : n.autonomy + " s"}</span>{/if}
            {/if}
          </div>
        {:else}<span class="dim">Aucune zone alimentée</span>{/each}
        {#if ui.race === 1}
          {#if dead}<div class="pnet"><i class="deadsw"></i><span class="dim">{dead} réseau{dead > 1 ? "x" : ""} à sec (sans sève)</span></div>{/if}
          <span class="dim small">Une couleur par réseau de racines : le terreau de même couleur partage sa réserve. Couper une racine coupe le réseau.</span>
        {:else}
        {#if dead}<div class="pnet"><i class="deadsw"></i><span class="dim">{dead} zone{dead > 1 ? "s" : ""} sans combustible ou sans générateur</span></div>{/if}
        <span class="dim small">Une couleur par réseau : des zones de même couleur sont reliées. Consommation / production · autonomie à cette charge.</span>
        {/if}
      </div>
    {/if}
    {#if ui.mode === "build" && ui.data?.buildings[ui.buildKind]?.key === "splitter"}
      <div class="floorbadge panel"><span class="kicker">Sorties</span> <SplitIcon mode={ui.buildSplit} size={22} /> <b>{["gauche, avant et droite", "gauche et avant", "droite et avant"][ui.buildSplit]}</b> <span class="dim">· molette pour changer</span></div>
    {/if}
    {#if ui.mode === "build" && ui.data?.buildings[ui.buildKind]?.cls === BClass.Belt}
      <div class="floorbadge panel"><span class="kicker">Niveau</span> <b>{["Sol", "Étage 1", "Étage 2"][ui.buildFloor]}</b> <span class="dim">· molette : monter ou descendre la suite de la file (la partie tracée garde son niveau) ; les ascenseurs se posent seuls</span></div>
    {/if}
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
  .arkpanel { padding: 9px 11px; min-width: 0; flex-shrink: 0; width: min(600px, calc(100vw - 545px)); max-height: 60vh; overflow-y: auto; scrollbar-width: thin; }
  @media (max-width: 1080px) { .arkpanel :global(.mods.wide) { flex-direction: column; } .arkpanel :global(.wide .opts) { flex-wrap: wrap; } }
  .pingbtn { position: absolute; right: 8px; top: 8px; width: 26px; height: 26px; display: grid; place-items: center; padding: 0; background: rgba(5, 10, 16, 0.75); border: 1px solid var(--line); color: var(--accent); cursor: pointer; }
  .pingbtn:hover, .pingbtn.on { color: var(--amber); border-color: var(--amber); }
  .minimap { position: relative; padding: 5px; line-height: 0; flex-shrink: 0; }
  .minimap canvas { width: 220px; height: 220px; cursor: crosshair; image-rendering: pixelated; }
  .corner { position: absolute; width: 14px; height: 14px; border-color: var(--accent); border-style: solid; pointer-events: none; filter: drop-shadow(0 0 4px var(--accent)); }
  .corner.tl { top: 3px; left: 3px; border-width: 2px 0 0 2px; }
  .corner.br { bottom: 3px; right: 3px; border-width: 0 2px 2px 0; }
  .mode { position: absolute; top: calc(var(--topbar-h, 48px) + 12px); left: 50%; transform: translateX(-50%); padding: 7px 14px; display: flex; align-items: center; gap: 8px; color: var(--accent); }
  .mode :global(.key) { margin-left: 4px; }
  .nowrap { white-space: nowrap; }
  .linecost { display: inline-flex; gap: 6px; align-items: center; }
  .linecost .bad, .mode .bad { color: var(--bad); }
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
  .waiting { position: absolute; top: calc(var(--topbar-h, 48px) + 56px); left: 50%; transform: translateX(-50%); padding: 9px 16px; color: var(--warn); display: flex; align-items: center; gap: 9px; }
  .pausebar { position: absolute; top: calc(var(--topbar-h, 48px) + 10px); left: 50%; transform: translateX(-50%); padding: 7px 10px 7px 14px; color: var(--amber); display: flex; align-items: center; gap: 8px; letter-spacing: 0.08em; text-transform: uppercase; font-size: 12.5px; z-index: 20; }
  .pausebar button { margin-left: 8px; display: inline-flex; align-items: center; gap: 6px; text-transform: none; letter-spacing: 0; padding: 3px 9px; }
  .dot { width: 8px; height: 8px; background: var(--amber); box-shadow: 0 0 10px var(--amber); animation: blink 1.2s infinite; }
  .replay { position: absolute; top: 60px; right: 10px; padding: 6px 10px; display: flex; gap: 4px; align-items: center; }
  .replay button { padding: 3px 8px; min-width: 34px; display: inline-flex; justify-content: center; }
  .perfbox { position: absolute; top: calc(var(--topbar-h, 48px) + 12px); left: 10px; padding: 9px 12px; font-size: 11.5px; display: flex; flex-direction: column; gap: 3px; pointer-events: none; }
  @keyframes slide { from { opacity: 0; transform: translateX(-10px); } }
  @keyframes blink { 50% { opacity: 0.3; } }
  .floorbadge { position: absolute; left: 50%; top: calc(var(--topbar-h, 48px) + 102px); transform: translateX(-50%); padding: 6px 12px; font-size: 12px; z-index: 6; pointer-events: none; white-space: nowrap; }
  .logilegend { position: absolute; left: 50%; top: calc(var(--topbar-h, 48px) + 16px); transform: translateX(-50%); display: flex; gap: 10px; align-items: center; padding: 6px 12px; font-size: 11.5px; z-index: 7; pointer-events: none; white-space: nowrap; }
  .logilegend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
  .logilegend .sep { width: 1px; height: 14px; background: var(--line); }
  .powerlegend { position: absolute; left: 16px; top: calc(var(--topbar-h, 48px) + 16px); display: flex; flex-direction: column; gap: 4px; padding: 8px 12px; font-size: 11.5px; z-index: 7; pointer-events: none; max-width: 300px; }
  .powerlegend i { display: inline-block; width: 11px; height: 11px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
  .powerlegend .deadsw { background: repeating-linear-gradient(45deg, #ff4a3d 0 3px, transparent 3px 6px); border: 1px solid #ff4a3d; }
  .powerlegend .warn { color: var(--amber); }
</style>
