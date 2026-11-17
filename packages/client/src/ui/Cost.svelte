<script lang="ts">
  import { ui } from "../game/state.svelte.ts";
  import Item from "./Item.svelte";
  let { cost }: { cost: [number, number][] } = $props();
</script>

<span class="cost">
  {#each cost as [it, n]}
    <span class="row" class:bad={(ui.stock[it] ?? 0) < n}><Item id={it} size={16} /><span class="num">{n}</span><span class="name">{ui.data?.items[it].name}</span></span>
  {/each}
</span>

<style>
  .cost { display: flex; flex-direction: column; gap: 2px; margin: 4px 0; }
  .row { display: flex; align-items: center; gap: 6px; }
  .num { min-width: 22px; text-align: right; }
  .name { color: var(--dim); }
  .bad .num,
  .bad .name { color: var(--bad); }
</style>
