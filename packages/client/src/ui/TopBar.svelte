<script lang="ts">
  import { ui } from "../game/state.svelte.ts";
  import { client } from "../game/client.ts";
  import { PACK1, GAME_SPEEDS, ADN, RELEVES, RACE_SOUCHE, RACE_TRANSH } from "@supreme/shared";
  import Item from "./Item.svelte";
  import ZoneBar from "./ZoneBar.svelte";
  import Icon from "./Icon.svelte";
  import Shortcuts from "./Shortcuts.svelte";
  import Settings from "./Settings.svelte";
  import { kb, keyOf } from "../game/keys.svelte.ts";
  const t = (label: string, id: string) => {
    const k = keyOf(id);
    return k ? `${label} (${k})` : label;
  };
  // hauteur de la barre (quatre lignes de ressources) : les panneaux placés dessous la suivent (--topbar-h)
  let leftH = $state(42);
  $effect(() => {
    document.documentElement.style.setProperty("--topbar-h", leftH + 6 + "px");
  });
  const tech = $derived(ui.data && ui.research ? ui.data.techs[ui.research] : null);
  const power = (kw: number) => (kw >= 1000 ? (kw / 1000).toFixed(1) + " MW" : kw + " kW");
  // énergie de la zone au centre de l'écran (pas d'énergie hors zone) : production, demande, installée, satisfaction, autonomie
  const zp = $derived(ui.zone && ui.zone.zone !== 0 ? ui.zone.power : undefined);
  const load = $derived(!zp ? 0 : zp[0] > 0 ? Math.min(1.2, zp[1] / zp[0]) : zp[1] > 0 ? 1.2 : 0);
  const autonomy = (s: number) => (s >= 120 ? Math.round(s / 60) + " min" : s + " s");
  const time = $derived.by(() => {
    const s = Math.floor(ui.tick / 20);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  });
</script>

<div class="top">
  {#if ui.me >= 0}
    <!-- la zone au centre de l'écran : ressources et énergie -->
    <div class="panel left" bind:clientHeight={leftH}>
      <ZoneBar />
      {#if ui.race !== RACE_SOUCHE && zp}
        <div class="sep"></div>
        <span class="tip gauge" class:bad={zp[1] > zp[0]}>
          <Icon name="power" size={15} />
          <span class="g">
            <span class="num">{power(zp[1])}<span class="faint"> / {power(zp[0])}</span></span>
            <span class="meter"><span style:width={Math.min(100, load * 100) + "%"}></span></span>
            <span class="auto num" class:warn={zp[4] >= 0 && zp[4] < 60}>{zp[4] < 0 ? (zp[0] > 0 ? "rien ne brûle" : "éteinte") : "autonomie " + autonomy(zp[4])}</span>
          </span>
          <span class="tt"><b>Énergie de la zone</b><br />Consommée / produite : <span class="num">{power(zp[1])}</span> / <span class="num">{power(zp[0])}</span>{#if zp[3] < 1024 && zp[1] > 0} <b class="bad">({Math.round((zp[3] / 1024) * 100)} % servis)</b>{/if}<br />Puissance installée : <span class="num">{power(zp[2])}</span>{#if zp[4] >= 0}<br />Autonomie à cette charge : <span class="num">{autonomy(zp[4])}</span>{/if}<br /><span class="dim">Un bâtiment hors réseau ou sous-alimenté ralentit. Total de vos zones : {power(ui.powerUse)} / {power(ui.powerProd)}.</span></span>
        </span>
      {/if}
    </div>
  {:else}
    <div class="panel left" bind:clientHeight={leftH}><span class="spect"><Icon name="eye" size={15} /> Mode spectateur</span></div>
  {/if}
  <div class="grow"></div>
  {#if ui.me >= 0}
    <!-- ce qui ne dépend pas de la zone : limite d'unités, recherche (à côté du panneau de droite, il ne bouge pas avec la zone) -->
    <div class="panel mid">
      <span class="tip stat"><Icon name="units" size={15} /><span class="num">{ui.unitCount}<span class="faint">/1000</span></span><span class="tt">Limite de 1 000 unités par joueur</span></span>
      <div class="sep"></div>
      <button class="research" class:idle={!tech} onclick={() => (ui.showResearch = !ui.showResearch)} title={t("Recherche", "research")}>
        {#if tech}
          <Item id={ui.race === RACE_SOUCHE ? ADN : ui.race === RACE_TRANSH ? RELEVES : PACK1 + tech.tier - 1} size={18} />
          <span class="rt">
            <span class="rn">{tech.name}</span>
            <span class="bar amber"><span style:width={(ui.researchProgress / tech.count) * 100 + "%"}></span></span>
          </span>
          <span class="num dim">{ui.researchProgress}/{tech.count}</span>{#if ui.researchQueue.length}<span class="num qn" title="Recherches en file">+{ui.researchQueue.length}</span>{/if}
        {:else}<Icon name="research" size={15} /> <span class="rn">Choisir une recherche</span> {#if keyOf("research")}<span class="key">{keyOf("research")}</span>{/if}{/if}
      </button>
    </div>
  {/if}
  <div class="panel right">
    <span class="clock num"><Icon name="clock" size={14} /> {time}</span>
    {#if !ui.replay && (client.isSolo() || client.isHost() || ui.speed === 0)}
      <span class="speed">
        {#if client.canPause()}
          <button class="ghost sp pz" class:on={ui.speed === 0} onclick={() => client.togglePause()} title={t(ui.speed === 0 ? "Reprendre la partie" : "Mettre en pause", "pause")}><Icon name={ui.speed === 0 ? "play" : "pause"} size={13} /></button>
        {/if}
        {#if client.isSolo()}
          <button class="ghost sp" disabled={ui.speed !== 0 && ui.speed <= GAME_SPEEDS[0]} onclick={() => client.stepSpeed(-1)} title={t("Ralentir le jeu", "speedDown")}>−</button>
        {/if}
        {#if ui.speed === 0}
          <span class="num sv paused" title={ui.pausedBy ? `Mise en pause par ${ui.pausedBy}` : "Partie en pause"}>Pause</span>
        {:else if client.isSolo()}
          <span class="num sv" class:fast={ui.speed > 1} class:slow={ui.speed < 1} title="Vitesse de jeu (partie solo)">×{String(ui.speed).replace(".", ",")}</span>
        {/if}
        {#if client.isSolo()}
          <button class="ghost sp" disabled={ui.speed >= GAME_SPEEDS[GAME_SPEEDS.length - 1]} onclick={() => client.stepSpeed(1)} title={t("Accélérer le jeu", "speedUp")}>+</button>
        {/if}
      </span>
    {/if}
    <div class="sep"></div>
    <button class="ghost icon-btn" class:on={ui.showStats} onclick={() => (ui.showStats = !ui.showStats)} title={t("Statistiques", "stats")}><Icon name="stats" /></button>
    <button class="ghost icon-btn" class:on={ui.showRecipes} onclick={() => (ui.showRecipes = !ui.showRecipes)} title={t("Recettes débloquées", "recipes")}><Icon name="recipe" /></button>
    <button class="ghost icon-btn" class:on={ui.showHelp} onclick={() => (ui.showHelp = !ui.showHelp)} title={t("Aide", "help")}><Icon name="help" /></button>
    <button class="ghost icon-btn" class:on={ui.showGfx} onclick={() => (ui.showGfx = !ui.showGfx)} title="Réglages"><Icon name="settings" /></button>
    <button class="ghost icon-btn" class:on={ui.menuOpen} onclick={() => client.openMenu()} title="Menu de la partie (Échap)"><Icon name="menu" /></button>
    <button class="ghost perf num" onclick={() => (ui.showPerf = !ui.showPerf)} title={t("Détail des performances", "perf")}>{ui.fps} i/s · {ui.backend} · {ui.ping} ms</button>
  </div>
</div>
{#if ui.showGfx}
  <div class="gfx panel"><Settings onkeys={() => { ui.showGfx = false; kb.showKeys = true; }} /></div>
{/if}
{#if kb.showKeys}<Shortcuts />{/if}

<style>
  .top { position: absolute; top: 6px; left: 6px; right: 6px; display: flex; align-items: stretch; gap: 8px; pointer-events: none; }
  .top > * { pointer-events: auto; }
  .left, .right { display: flex; align-items: center; gap: 10px; padding: 5px 12px; height: 42px; min-width: 0; }
  .left { flex-shrink: 0; overflow: visible; height: auto; min-height: 42px; }
  .right, .mid { align-self: flex-start; }
  .mid { display: flex; align-items: center; gap: 10px; padding: 5px 12px; height: 42px; min-width: 0; flex-shrink: 1; }
  .g .auto { font-size: 10px; color: var(--dim); }
  .g .auto.warn { color: var(--warn); }
  .grow { flex: 1; }
  .sep { width: 1px; height: 24px; background: linear-gradient(180deg, transparent, var(--line-hi), transparent); flex-shrink: 0; }
  .gauge { display: flex; align-items: center; gap: 7px; color: var(--accent); white-space: nowrap; }
  .gauge.bad { color: var(--bad); }
  .g { display: flex; flex-direction: column; gap: 3px; color: var(--text); font-size: 12px; }
  .meter { display: block; height: 3px; width: 100%; background: rgba(62, 240, 255, 0.12); }
  .meter > span { display: block; height: 100%; background: var(--accent); box-shadow: 0 0 6px var(--accent); }
  .gauge.bad .meter > span { background: var(--bad); box-shadow: 0 0 6px var(--bad); }
  .stat { display: flex; align-items: center; gap: 6px; color: var(--accent); white-space: nowrap; }
  .stat .num { color: var(--text); font-size: 12.5px; }
  .research { display: flex; align-items: center; gap: 8px; min-width: 120px; max-width: 280px; padding: 4px 10px; text-align: left; flex-shrink: 1; overflow: hidden; white-space: nowrap; }
  .research .qn { color: var(--amber); font-size: 11px; }
  .research.idle { --b-line: rgba(255, 181, 71, 0.6); color: var(--amber); animation: nudge 2.4s ease-in-out infinite; }
  .rt { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
  .rn { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rt .bar { height: 4px; }
  .rt .bar > span { display: block; height: 100%; background: var(--amber); box-shadow: 0 0 6px var(--amber); }
  .spect { display: flex; align-items: center; gap: 7px; color: var(--amber); letter-spacing: 0.12em; text-transform: uppercase; font-size: 12px; }
  .speed { display: flex; align-items: center; gap: 2px; margin-left: 6px; }
  .speed .sp { min-width: 22px; padding: 0 4px; font-size: 15px; line-height: 20px; }
  .speed .sv { min-width: 34px; text-align: center; font-size: 12.5px; color: var(--dim); }
  .speed .sv.fast { color: var(--accent); }
  .speed .sv.slow { color: var(--warn); }
  .speed .sv.paused { color: var(--amber); letter-spacing: 0.08em; text-transform: uppercase; font-size: 11px; }
  .speed .pz { display: inline-flex; align-items: center; justify-content: center; }
  .clock { display: flex; align-items: center; gap: 6px; color: var(--text); font-size: 13px; }
  .clock :global(.ic) { color: var(--accent); }
  .right .icon-btn { padding: 6px 7px; }
  .perf { font-size: 10.5px; color: var(--dim); white-space: nowrap; padding: 4px 4px; }
  @keyframes nudge { 50% { filter: drop-shadow(0 0 8px rgba(255, 181, 71, 0.55)); } }
  @media (max-width: 1250px) {
    .perf { display: none; }
    .left { gap: 7px; }
  }
  @media (max-width: 1000px) {
    .research { min-width: 44px; }
    .rn, .research.idle span:not(.key) { display: none; }
  }
  .gfx { position: absolute; top: 56px; right: 8px; padding: 14px 16px; z-index: 25; width: 290px; animation: drop 0.14s ease-out; }
  @keyframes drop { from { opacity: 0; transform: translateY(-6px); } }
</style>
