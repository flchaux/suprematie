<script lang="ts">
  import { ui } from "../game/state.svelte.ts";
  let { id, n = null, need = null }: { id: number; n?: number | null; need?: number | null } = $props();
  const it = $derived(ui.data?.items[id]);
  const col = $derived("#" + (it?.color ?? 0).toString(16).padStart(6, "0"));
</script>

<span class="item" title={it?.name}>
  <span class="sw" style:background={col}></span>
  {#if n !== null}<span class:bad={need !== null && n < need}>{n}</span>{/if}
  {#if need !== null && n === null}<span>{need}</span>{/if}
</span>
