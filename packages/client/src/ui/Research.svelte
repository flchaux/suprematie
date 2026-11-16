<script lang="ts">
  import { ui, hasTechUI } from "../game/state.svelte.ts";
  import { client } from "../game/client.ts";
  import Item from "./Item.svelte";
  import { PACK1 } from "@supreme/shared";
  const d = $derived(ui.data);
  const tiers = [1, 2, 3, 4, 5, 6];
</script>

<div class="modal panel">
  <button class="close" onclick={() => (ui.showResearch = false)}>Fermer (T)</button>
  <h2>Recherche</h2>
  <p class="dim">Les laboratoires consomment les lots de recherche apportés par des bras. Une recherche d'un palier demande aussi les lots des paliers inférieurs.</p>
  {#if d}
    <div class="cols">
      {#each tiers as tier}
        <div class="col">
          <h3><Item id={PACK1 + tier - 1} /> Palier {tier}</h3>
          {#each d.techs.map((t, i) => ({ t, i })).filter(({ t }) => t.tier === tier) as { t, i }}
            {@const done = hasTechUI(i)}
            {@const avail = !done && t.prereq.every((p) => hasTechUI(p))}
            {@const cur = ui.research === i}
            <button class="tech" class:done class:cur disabled={!avail || ui.me < 0} onclick={() => client.research(i)}>
              <b>{t.name}</b>
              <span class="desc">{t.desc}</span>
              <span class="dim small">{t.count} × {t.time} s{#if t.prereq.length} · après {t.prereq.map((p) => d.techs[p].name).join(", ")}{/if}</span>
              {#if cur}<div class="bar"><div style:width={(ui.researchProgress / t.count) * 100 + "%"}></div></div>{/if}
              {#if done}<span class="good small">Terminée</span>{/if}
            </button>
          {/each}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .cols { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
  .col { display: flex; flex-direction: column; gap: 5px; }
  h3 { margin: 4px 0; font-size: 14px; }
  .tech { display: flex; flex-direction: column; align-items: flex-start; text-align: left; gap: 2px; padding: 6px; }
  .tech.done { border-color: var(--good); opacity: 0.7; }
  .tech.cur { border-color: var(--warn); background: #3a3420; }
  .desc { font-size: 11px; }
  .small { font-size: 11px; }
  .bar { width: 100%; }
</style>
