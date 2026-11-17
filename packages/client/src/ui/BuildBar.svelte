<script lang="ts">
  import { ui, hasTechUI } from "../game/state.svelte.ts";
  import { client } from "../game/client.ts";
  import Cost from "./Cost.svelte";
  import Icon from "./Icon.svelte";
  import { sprite } from "./sprites.ts";

  const CATS: [string, string, string[]][] = [
    ["Production", "production", ["extractor", "furnace", "assembler1", "assembler2", "assembler3", "refinery", "chemical", "lab", "depot"]],
    ["Logistique", "logistics", ["belt1", "belt2", "belt3", "inserter", "pylon", "warehouse", "rail", "station", "cargo_pad"]],
    ["Énergie", "energy", ["generator", "hydro_plant", "crystal_reactor"]],
    ["Usines", "factory", ["land_factory", "air_factory", "naval_factory", "gantry"]],
    ["Défense", "defense", ["radar", "wall", "light_turret", "aa_turret", "heavy_turret", "fixed_artillery", "shield_gen", "antimissile"]],
    ["Spécial", "special", ["transfer", "gate", "area_shield", "missile_silo", "beacon", "orbital"]],
  ];
  let cat = $state(0);
  const idx = $derived(ui.data ? Object.fromEntries(ui.data.buildings.map((b, i) => [b.key, i])) : {});
  const short = (n: string) => n.replace("Tourelle ", "T. ").replace("Générateur de bouclier", "Bouclier").replace("Centrale à hydrocarbure", "Centrale").replace("Silo de missile stratégique", "Silo stratégique").replace("Plateforme de transfert", "Transfert").replace("Défense antimissile", "Antimissile").replace("Balise d'hyperespace", "Balise").replace("Portique expérimental", "Portique");
  function keydown(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.tagName === "INPUT") return;
    if (e.key === "b" || e.key === "B") cat = (cat + 1) % CATS.length;
  }
</script>

<svelte:window onkeydown={keydown} />

<div class="panel build">
  <div class="tabs">
    {#each CATS as [name, icon], i}
      <button class="tab" class:on={cat === i} onclick={() => (cat = i)} title={name}><Icon name={icon} size={15} /><span>{name}</span></button>
    {/each}
    <span class="hint"><span class="key">B</span></span>
  </div>
  <div class="grid">
    {#each CATS[cat][2] as key}
      {@const i = idx[key]}
      {@const b = ui.data?.buildings[i]}
      {#if b}
        {@const ok = hasTechUI(b.tech)}
        {@const src = sprite("buildings", key)}
        <div class="tip">
          <button class="card" class:on={ui.buildKind === i && ui.mode === "build"} class:locked={!ok} disabled={!ok} onclick={() => client.startBuild(i)}>
            {#if src}<img {src} alt="" />{:else}<span class="ph"><Icon name={CATS[cat][1]} size={26} /></span>{/if}
            <span class="name">{short(b.name)}</span>
            <span class="sz num">{b.w}×{b.h}</span>
            {#if !ok}<span class="lock"><Icon name="lock" size={14} /></span>{/if}
          </button>
          <div class="tt">
            <b>{b.name}</b> <span class="dim num">{b.w}×{b.h}</span><br />
            {#if !ok}<span class="bad"><Icon name="lock" size={12} /> Recherche requise : {ui.data?.techs[b.tech].name}</span><br />{/if}
            <Cost cost={b.cost} />
            {#if b.powerUse}<span class="dim"><Icon name="power" size={12} /> Consomme {b.powerUse} kW</span><br />{/if}
            {#if b.powerProd}<span class="good"><Icon name="power" size={12} /> Produit {b.powerProd} kW</span><br />{/if}
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
  .build { padding: 8px; display: flex; flex-direction: column; gap: 7px; max-width: 600px; }
  .tabs { display: flex; gap: 3px; align-items: center; }
  .tab { display: inline-flex; align-items: center; gap: 5px; padding: 4px 8px; font-size: 11.5px; }
  .tab:not(.on) span { display: none; }
  .tab:hover span { display: inline; }
  .hint { margin-left: auto; padding-right: 4px; }
  .grid { display: grid; grid-template-columns: repeat(5, 106px); gap: 5px; }
  .card { position: relative; width: 106px; height: 86px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 1px; padding: 4px 4px 5px; overflow: hidden; }
  .card img { position: absolute; top: 3px; left: 50%; transform: translateX(-50%); width: 58px; height: 58px; object-fit: contain; filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.6)); transition: transform 0.15s; }
  .card:hover:not(:disabled) img { transform: translateX(-50%) scale(1.08) translateY(-2px); }
  .ph { position: absolute; top: 14px; color: var(--accent); opacity: 0.6; }
  .name { position: relative; font-size: 11px; line-height: 1.1; text-align: center; letter-spacing: 0.02em; }
  .sz { position: absolute; top: 3px; right: 5px; font-size: 9.5px; color: var(--dim); }
  .lock { position: absolute; top: 4px; left: 5px; color: var(--amber); }
  .card.locked img { filter: grayscale(1) brightness(0.55); }
  .card:disabled { opacity: 0.62; }
  @media (max-width: 1100px) {
    .grid { grid-template-columns: repeat(4, 96px); }
    .card { width: 96px; }
  }
</style>
