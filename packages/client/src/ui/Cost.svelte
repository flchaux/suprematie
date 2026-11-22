<script lang="ts">
  import { ui } from "../game/state.svelte.ts";
  import Item from "./Item.svelte";
  import { costShort } from "../game/reach.ts";
  // `have` : disponible à portée du lieu concerné (réseau logistique : dépôts, relais, soute du commandant ;
  // voir rendu.md, Couleur des coûts) ; null : inconnu, rien n'est marqué. Sans `have` : stock du joueur
  // (Souche : réserves de ses réseaux).
  let { cost, have }: { cost: [number, number][]; have?: number[] | null } = $props();
  const list = $derived(have === undefined ? ui.stock : have);
</script>

<span class="cost">
  {#each cost as [it, n]}
    <span class="row" class:bad={costShort(list, it, n)}><Item id={it} size={16} /><span class="num">{n}</span><span class="name">{ui.data?.items[it].name}</span></span>
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
