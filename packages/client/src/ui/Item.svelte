<script lang="ts">
  import { ui } from "../game/state.svelte.ts";
  import { sprite } from "./sprites.ts";
  let { id, n = null, need = null, size = 18 }: { id: number; n?: number | null; need?: number | null; size?: number } = $props();
  const it = $derived(ui.data?.items[id]);
  const col = $derived("#" + (it?.color ?? 0).toString(16).padStart(6, "0"));
  const src = $derived(sprite("items", it?.key));
  const fmt = (v: number) => (v >= 100000 ? Math.round(v / 1000) + "k" : v >= 10000 ? (v / 1000).toFixed(1) + "k" : String(v));
</script>

<!-- title vide : l'infobulle de la ressource (tooltips.ts) remplace celle de l'élément qui la contient, et la reprend -->
<span class="item" data-item={id} title="" aria-label={it?.name}>
  {#if src}<img class="ico" {src} alt="" width={size} height={size} style:--c={col} />{:else}<span class="sw" style:background={col}></span>{/if}
  {#if n !== null}<span class="num" class:bad={need !== null && n < need}>{fmt(n)}{#if need !== null}<span class="faint">/{need}</span>{/if}</span>{/if}
  {#if need !== null && n === null}<span class="num">{need}</span>{/if}
</span>

<style>
  .ico { object-fit: contain; filter: drop-shadow(0 0 3px color-mix(in srgb, var(--c) 45%, transparent)); }
</style>
