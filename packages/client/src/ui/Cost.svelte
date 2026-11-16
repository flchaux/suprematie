<script lang="ts">
  import { ui } from "../game/state.svelte.ts";
  let { cost }: { cost: [number, number][] } = $props();
</script>

<span class="cost">
  {#each cost as [it, n]}
    <span class="item"><span class="sw" style:background={"#" + (ui.data?.items[it].color ?? 0).toString(16).padStart(6, "0")}></span>
      <span class:bad={(ui.stock[it] ?? 0) < n}>{n} {ui.data?.items[it].name}</span></span>
  {/each}
</span>

<style>
  .cost { display: flex; flex-direction: column; gap: 1px; }
</style>
