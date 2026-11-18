<script lang="ts">
  // Écran des recettes : celles que nos recherches ont débloquées, par machine, et le nombre restant à débloquer.
  import { ui, hasTechUI } from "../game/state.svelte.ts";
  import { keyOf } from "../game/keys.svelte.ts";
  import type { GameData } from "@supreme/shared";
  import Icon from "./Icon.svelte";
  import Item from "./Item.svelte";

  const d = $derived(ui.data as GameData | null);
  // machines (Crafter de la simulation) : nom affiché et bâtiment de référence pour la vitesse
  const MACHINES: { crafter: number; name: string; key: string }[] = [
    { crafter: 0, name: "Fonderie", key: "furnace" },
    { crafter: 1, name: "Assembleur", key: "assembler1" },
    { crafter: 2, name: "Raffinerie", key: "refinery" },
    { crafter: 3, name: "Usine chimique", key: "chemical" },
  ];
  const groups = $derived.by(() => {
    if (!d) return [];
    void ui.researchedLo;
    void ui.researchedHi;
    return MACHINES.map((m) => {
      const all = d.recipes.map((r, i) => ({ r, i })).filter(({ r }) => r.crafter === m.crafter);
      const open = all.filter(({ r }) => hasTechUI(r.tech));
      const speed = d.buildings.find((b) => b.key === m.key)?.speed ?? 100;
      return { ...m, open, locked: all.length - open.length, speed };
    }).filter((g) => g.open.length || g.locked);
  });
  const total = $derived(groups.reduce((a, g) => a + g.open.length, 0));
  const locked = $derived(groups.reduce((a, g) => a + g.locked, 0));
  const key = $derived(keyOf("recipes"));
  /** objets par minute à la vitesse de la machine de base */
  const perMin = (n: number, time: number, speed: number) => ((n * 60 * 20 * speed) / 100 / Math.max(1, time)).toFixed(1);
</script>

<div class="modal panel">
  <button class="close ghost icon-btn" onclick={() => (ui.showRecipes = false)} title={key ? `Fermer (${key})` : "Fermer"}><Icon name="close" /></button>
  <div class="modal-head">
    <Icon name="recipe" size={26} />
    <div>
      <div class="kicker">Production</div>
      <h2>Recettes débloquées</h2>
    </div>
    <span class="dim count num">{total} recettes{#if locked} · {locked} à débloquer par la recherche{/if}</span>
  </div>
  {#if d}
    {#each groups as g (g.crafter)}
      <h3>{g.name}{#if g.locked}<span class="dim small"> · {g.locked} verrouillée{g.locked > 1 ? "s" : ""}</span>{/if}</h3>
      <div class="grid">
        {#each g.open as { r, i } (i)}
          <div class="card">
            <div class="flow">
              {#each r.inputs as [it, n]}<Item id={it} {n} />{/each}
              <span class="arrow">▸</span>
              <Item id={r.output[0]} n={r.output[1]} />
            </div>
            <div class="name">{d.items[r.output[0]].name}</div>
            <div class="dim small num">{(r.time / 20 / (g.speed / 100)).toFixed(1)} s · {perMin(r.output[1], r.time, g.speed)} /min</div>
          </div>
        {/each}
      </div>
    {/each}
  {/if}
</div>

<style>
  .count { margin-left: auto; font-size: 12px; }
  h3 { margin: 14px 0 8px; font-size: 13px; color: var(--accent); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
  .card { padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; background: rgba(255, 255, 255, 0.02); }
  .flow { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .arrow { color: var(--accent); }
  .name { margin-top: 4px; font-weight: 600; font-size: 12.5px; }
  .small { font-size: 11px; }
</style>
