<script lang="ts">
  import { ui } from "../game/state.svelte.ts";
  import { client } from "../game/client.ts";
  import { PACK1 } from "@supreme/shared";
  import Item from "./Item.svelte";
  import Icon from "./Icon.svelte";
  // objets montrés en permanence (les plaques et composants de base), puis les autres dès qu'il y en a
  const SHOWN = [6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
  const tech = $derived(ui.data && ui.research ? ui.data.techs[ui.research] : null);
  const power = (kw: number) => (kw >= 1000 ? (kw / 1000).toFixed(1) + " MW" : kw + " kW");
  const load = $derived(ui.powerProd > 0 ? Math.min(1.2, ui.powerUse / ui.powerProd) : ui.powerUse > 0 ? 1.2 : 0);
  const time = $derived.by(() => {
    const s = Math.floor(ui.tick / 20);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  });
</script>

<div class="top">
  <div class="panel left">
    {#if ui.me >= 0}
      <div class="stock">
        {#each SHOWN as id}
          {#if id <= 12 || (ui.stock[id] ?? 0) > 0}
            <span class="tip res"><Item {id} n={ui.stock[id] ?? 0} size={20} /><span class="tt"><b>{ui.data?.items[id].name}</b><br /><span class="num">{ui.stock[id] ?? 0}</span> dans le stock commun</span></span>
          {/if}
        {/each}
      </div>
      <div class="sep"></div>
      <span class="tip gauge" class:bad={ui.powerUse > ui.powerProd}>
        <Icon name="power" size={15} />
        <span class="g">
          <span class="num">{power(ui.powerUse)}<span class="faint"> / {power(ui.powerProd)}</span></span>
          <span class="meter"><span style:width={Math.min(100, load * 100) + "%"}></span></span>
        </span>
        <span class="tt"><b>Énergie</b><br />Consommée / produite. Un bâtiment hors réseau ou sous-alimenté ralentit.</span>
      </span>
      <div class="sep"></div>
      <span class="tip stat"><Icon name="units" size={15} /><span class="num">{ui.unitCount}<span class="faint">/1000</span></span><span class="tt">Limite de 1 000 unités par joueur</span></span>
      <div class="sep"></div>
      <button class="research" class:idle={!tech} onclick={() => (ui.showResearch = !ui.showResearch)} title="Recherche (T)">
        {#if tech}
          <Item id={PACK1 + tech.tier - 1} size={18} />
          <span class="rt">
            <span class="rn">{tech.name}</span>
            <span class="bar amber"><span style:width={(ui.researchProgress / tech.count) * 100 + "%"}></span></span>
          </span>
          <span class="num dim">{ui.researchProgress}/{tech.count}</span>
        {:else}<Icon name="research" size={15} /> <span>Choisir une recherche</span> <span class="key">T</span>{/if}
      </button>
    {:else}
      <span class="spect"><Icon name="eye" size={15} /> Mode spectateur</span>
    {/if}
  </div>
  <div class="grow"></div>
  <div class="panel right">
    <span class="clock num"><Icon name="clock" size={14} /> {time}</span>
    <div class="sep"></div>
    <button class="ghost icon-btn" class:on={ui.showStats} onclick={() => (ui.showStats = !ui.showStats)} title="Statistiques (Tab)"><Icon name="stats" /></button>
    <button class="ghost icon-btn" class:on={ui.showHelp} onclick={() => (ui.showHelp = !ui.showHelp)} title="Aide (F1)"><Icon name="help" /></button>
    <button class="ghost icon-btn" class:on={ui.showGfx} onclick={() => (ui.showGfx = !ui.showGfx)} title="Réglages"><Icon name="settings" /></button>
    <button class="ghost perf num" onclick={() => (ui.showPerf = !ui.showPerf)} title="Détail des performances (F3)">{ui.fps} i/s · {ui.backend} · {ui.ping} ms</button>
  </div>
</div>
{#if ui.showGfx}
  <div class="gfx panel">
    <div class="kicker">Réglages</div>
    <label class="row"><Icon name="volume" /> <span>Volume</span><input type="range" min="0" max="1" step="0.05" value={ui.volume} oninput={(e) => client.setVolume(Number((e.target as HTMLInputElement).value))} /></label>
    <label class="row" title="Distance de la caméra à partir de laquelle les unités deviennent des icônes"><Icon name="icons" /> <span>Vue stratégique</span><input type="range" min="80" max="600" step="10" value={client.iconDistance()} oninput={(e) => client.setIconDistance(Number((e.target as HTMLInputElement).value))} /></label>
    <div class="kicker sub">Graphismes</div>
    <label class="row"><Icon name="eye" /> <span>Ombres portées</span><input type="checkbox" checked={ui.gfx.shadows} onchange={(e) => client.setGfx({ shadows: (e.target as HTMLInputElement).checked })} /></label>
    <label class="row"><Icon name="special" /> <span>Halo lumineux</span><input type="checkbox" checked={ui.gfx.bloom} onchange={(e) => client.setGfx({ bloom: (e.target as HTMLInputElement).checked })} /></label>
    <label class="row"><Icon name="target" /> <span>Effets de combat</span>
      <select value={String(ui.gfx.effects)} onchange={(e) => client.setGfx({ effects: Number((e.target as HTMLSelectElement).value) })}>
        <option value="1">Complets</option>
        <option value="0.4">Réduits</option>
      </select>
    </label>
    <p class="dim small"><span class="key">F3</span> détail des performances</p>
  </div>
{/if}

<style>
  .top { position: absolute; top: 6px; left: 6px; right: 6px; display: flex; align-items: stretch; gap: 8px; pointer-events: none; }
  .top > * { pointer-events: auto; }
  .left, .right { display: flex; align-items: center; gap: 10px; padding: 5px 12px; height: 42px; min-width: 0; }
  .left { flex-shrink: 1; overflow: visible; }
  .grow { flex: 1; }
  .stock { display: flex; gap: 11px; }
  .res :global(.num) { font-size: 12.5px; }
  .sep { width: 1px; height: 24px; background: linear-gradient(180deg, transparent, var(--line-hi), transparent); flex-shrink: 0; }
  .gauge { display: flex; align-items: center; gap: 7px; color: var(--accent); white-space: nowrap; }
  .gauge.bad { color: var(--bad); }
  .g { display: flex; flex-direction: column; gap: 3px; color: var(--text); font-size: 12px; }
  .meter { display: block; height: 3px; width: 100%; background: rgba(62, 240, 255, 0.12); }
  .meter > span { display: block; height: 100%; background: var(--accent); box-shadow: 0 0 6px var(--accent); }
  .gauge.bad .meter > span { background: var(--bad); box-shadow: 0 0 6px var(--bad); }
  .stat { display: flex; align-items: center; gap: 6px; color: var(--accent); white-space: nowrap; }
  .stat .num { color: var(--text); font-size: 12.5px; }
  .research { display: flex; align-items: center; gap: 8px; min-width: 120px; max-width: 280px; padding: 4px 10px; text-align: left; flex-shrink: 1; overflow: hidden; }
  .research.idle { --b-line: rgba(255, 181, 71, 0.6); color: var(--amber); animation: nudge 2.4s ease-in-out infinite; }
  .rt { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
  .rn { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rt .bar { height: 4px; }
  .rt .bar > span { display: block; height: 100%; background: var(--amber); box-shadow: 0 0 6px var(--amber); }
  .spect { display: flex; align-items: center; gap: 7px; color: var(--amber); letter-spacing: 0.12em; text-transform: uppercase; font-size: 12px; }
  .clock { display: flex; align-items: center; gap: 6px; color: var(--text); font-size: 13px; }
  .clock :global(.ic) { color: var(--accent); }
  .right .icon-btn { padding: 6px 7px; }
  .perf { font-size: 10.5px; color: var(--dim); white-space: nowrap; padding: 4px 4px; }
  .top :global(.tip .tt) { top: calc(100% + 8px); bottom: auto; }
  @keyframes nudge { 50% { filter: drop-shadow(0 0 8px rgba(255, 181, 71, 0.55)); } }
  @media (max-width: 1250px) {
    .perf { display: none; }
    .stock { gap: 7px; }
    .left { gap: 7px; }
  }
  @media (max-width: 1000px) {
    .research { min-width: 44px; }
    .rn, .research.idle span:not(.key) { display: none; }
  }
  .gfx { position: absolute; top: 56px; right: 8px; padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; z-index: 25; width: 290px; animation: drop 0.14s ease-out; }
  .gfx .row { display: grid; grid-template-columns: 18px 1fr auto; align-items: center; gap: 9px; color: var(--accent); }
  .gfx .row span { color: var(--text); }
  .gfx input[type="range"] { width: 100px; }
  .gfx .sub { margin-top: 6px; }
  .gfx p { margin: 4px 0 0; }
  @keyframes drop { from { opacity: 0; transform: translateY(-6px); } }
</style>
