<script lang="ts">
  // Grille des courbes de la partie (onglet « Courbes » des statistiques et rapport de fin).
  import type { StatSample } from "@supreme/shared";
  import { ui } from "../game/state.svelte.ts";
  import Chart from "./Chart.svelte";
  import Icon from "./Icon.svelte";
  import { METRICS, playerColor } from "./stats.ts";

  let { samples, players, note = "" }: { samples: StatSample[]; players: number[]; note?: string } = $props();
</script>

<div class="legend">
  {#each players as i (i)}
    {@const p = ui.players[i]}
    <span class="who" class:out={p && !p.alive}><span class="pc" style:background={playerColor(i)}></span>{p?.name ?? `Joueur ${i + 1}`}{#if p?.bot} <Icon name="bot" size={11} />{/if}</span>
  {/each}
  {#if note}<span class="note dim">{note}</span>{/if}
</div>
<div class="grid">
  {#each METRICS as m (m.key)}
    <Chart metric={m} {samples} {players} />
  {/each}
</div>

<style>
  .legend { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; margin-bottom: 12px; }
  .who { display: inline-flex; align-items: center; gap: 4px; }
  .who.out { color: var(--faint); text-decoration: line-through; text-decoration-color: rgba(255, 77, 94, 0.5); }
  .pc { display: inline-block; width: 9px; height: 9px; margin-right: 4px; transform: rotate(45deg); }
  .note { margin-left: auto; font-size: 11px; }
  .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px 22px; }
  @media (max-width: 1250px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 620px) { .grid { grid-template-columns: minmax(0, 1fr); } }
</style>
