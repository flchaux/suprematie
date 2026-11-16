<script lang="ts">
  import { ui } from "../game/state.svelte.ts";
  import { client } from "../game/client.ts";
  import Item from "./Item.svelte";
  // objets montrés en permanence
  const SHOWN = [6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
  const tech = $derived(ui.data && ui.research ? ui.data.techs[ui.research] : null);
  const fmt = (n: number) => (n >= 10000 ? (n / 1000).toFixed(0) + "k" : String(n));
  const power = (kw: number) => (kw >= 1000 ? (kw / 1000).toFixed(1) + " MW" : kw + " kW");
  const time = $derived.by(() => {
    const s = Math.floor(ui.tick / 20);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  });
</script>

<div class="top panel">
  {#if ui.me >= 0}
    <div class="stock">
      {#each SHOWN as id}
        {#if id <= 12 || (ui.stock[id] ?? 0) > 0}
          <span class="tip"><Item {id} n={ui.stock[id] ?? 0} /><span class="tt">{ui.data?.items[id].name} : {ui.stock[id] ?? 0} en stock</span></span>
        {/if}
      {/each}
    </div>
    <div class="sep"></div>
    <span class="tip" class:bad={ui.powerUse > ui.powerProd}>⚡ {power(ui.powerUse)} / {power(ui.powerProd)}<span class="tt">Énergie consommée / produite. Un bâtiment hors réseau ou sous-alimenté ralentit.</span></span>
    <div class="sep"></div>
    <span class="tip">Unités {ui.unitCount}/1000<span class="tt">Limite de 1 000 unités par joueur</span></span>
    <div class="sep"></div>
    <button class="research" onclick={() => (ui.showResearch = !ui.showResearch)}>
      {#if tech}
        {tech.name} {ui.researchProgress}/{tech.count}
        <div class="bar"><div style:width={(ui.researchProgress / tech.count) * 100 + "%"}></div></div>
      {:else}<span class="warn">Recherche (T)</span>{/if}
    </button>
  {:else}
    <span class="warn">Spectateur</span>
  {/if}
  <div class="grow"></div>
  <span class="dim">{time}</span>
  <button onclick={() => (ui.showStats = !ui.showStats)} title="Statistiques (Tab)">Stats</button>
  <button onclick={() => (ui.showHelp = !ui.showHelp)} title="Aide (F1)">?</button>
  <label class="vol" title="Volume">🔊<input type="range" min="0" max="1" step="0.05" value={ui.volume} oninput={(e) => client.setVolume(Number((e.target as HTMLInputElement).value))} /></label>
  <span class="dim small">{ui.fps} i/s · {ui.backend} · {ui.ping} ms</span>
</div>

<style>
  .top { position: absolute; top: 4px; left: 4px; right: 4px; display: flex; align-items: center; gap: 8px; padding: 4px 8px; height: 38px; }
  .stock { display: flex; gap: 10px; }
  .sep { width: 1px; height: 22px; background: var(--line); }
  .grow { flex: 1; }
  .research { min-width: 170px; text-align: left; padding: 2px 8px; }
  .vol input { width: 70px; vertical-align: middle; }
  .small { font-size: 11px; }
</style>
