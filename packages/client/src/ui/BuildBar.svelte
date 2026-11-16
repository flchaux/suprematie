<script lang="ts">
  import { ui, hasTechUI } from "../game/state.svelte.ts";
  import { client } from "../game/client.ts";
  import Cost from "./Cost.svelte";

  const CATS: [string, string[]][] = [
    ["Production", ["extractor", "furnace", "assembler1", "assembler2", "assembler3", "refinery", "chemical", "lab", "depot"]],
    ["Logistique", ["belt1", "belt2", "belt3", "inserter", "pylon"]],
    ["Énergie", ["generator", "hydro_plant", "crystal_reactor"]],
    ["Usines", ["land_factory", "air_factory", "naval_factory", "gantry"]],
    ["Défense", ["radar", "wall", "light_turret", "aa_turret", "heavy_turret", "fixed_artillery", "shield_gen", "antimissile"]],
    ["Spécial", ["transfer", "gate", "area_shield", "missile_silo", "beacon", "orbital"]],
  ];
  let cat = $state(0);
  const idx = $derived(ui.data ? Object.fromEntries(ui.data.buildings.map((b, i) => [b.key, i])) : {});
  const short = (n: string) => n.replace("Tourelle ", "T. ").replace("Générateur de bouclier", "Bouclier").replace("Centrale à hydrocarbure", "Centrale").slice(0, 16);
  function keydown(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.tagName === "INPUT") return;
    if (e.key === "b" || e.key === "B") cat = (cat + 1) % CATS.length;
  }
</script>

<svelte:window onkeydown={keydown} />

<div class="panel build">
  <div class="tabs">
    {#each CATS as [name], i}
      <button class:on={cat === i} onclick={() => (cat = i)}>{name}</button>
    {/each}
  </div>
  <div class="grid">
    {#each CATS[cat][1] as key}
      {@const i = idx[key]}
      {@const b = ui.data?.buildings[i]}
      {#if b}
        {@const ok = hasTechUI(b.tech)}
        <div class="tip">
          <button class="bb" class:on={ui.buildKind === i && ui.mode === "build"} disabled={!ok} onclick={() => client.startBuild(i)}>
            <span class="name">{short(b.name)}</span>
            <span class="dim sz">{b.w}×{b.h}</span>
          </button>
          <div class="tt">
            <b>{b.name}</b><br />
            {#if !ok}<span class="bad">Recherche requise : {ui.data?.techs[b.tech].name}</span><br />{/if}
            <Cost cost={b.cost} />
            {#if b.powerUse}<span class="dim">Consomme {b.powerUse} kW</span><br />{/if}
            {#if b.powerProd}<span class="good">Produit {b.powerProd} kW</span><br />{/if}
            {#if b.deposit === 255}<span class="dim">Se pose sur un gisement</span>{/if}
            {#if b.deposit === 4}<span class="dim">Se pose sur un gisement d'hydrocarbure</span>{/if}
            {#if b.water}<span class="dim">Se pose sur l'eau</span>{/if}
          </div>
        </div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .build { padding: 5px; display: flex; flex-direction: column; gap: 5px; max-width: 560px; }
  .tabs { display: flex; gap: 3px; flex-wrap: wrap; }
  .tabs button { padding: 2px 7px; font-size: 12px; }
  .grid { display: grid; grid-template-columns: repeat(5, 104px); gap: 4px; }
  .bb { width: 104px; height: 44px; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; padding: 3px 6px; text-align: left; }
  .name { font-size: 12px; line-height: 1.1; }
  .sz { font-size: 10px; }
</style>
