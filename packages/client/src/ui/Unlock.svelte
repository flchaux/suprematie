<script lang="ts">
  // Ce qu'une recherche débloque : une vignette (icône de l'unité, du bâtiment ou de l'amélioration) et sa
  // fiche au survol (description, chiffres, coût, d'où elle sort). Voir game/research.ts, techUnlocks.
  import { ui } from "../game/state.svelte.ts";
  import { client } from "../game/client.ts";
  import { sprite } from "./sprites.ts";
  import Icon from "./Icon.svelte";
  import Cost from "./Cost.svelte";
  import { UNIT_DESCS } from "../game/unitDescs.ts";
  import { BUILDING_DESCS } from "../game/buildingDescs.ts";

  let { kind, index, got = false }: { kind: "unit" | "building" | "mod"; index: number; got?: boolean } = $props();
  const d = $derived(ui.data);
  const abbrev = (n: string) => n.split(/[\s-]/).map((w) => w[0]).join("").slice(0, 3).toUpperCase();
  /** bâtiment de la même race qui produit ce type d'unité (usine, couveuse, frayère, atelier) */
  const makerOf = (factory: number, race: number) => (factory > 0 ? d?.buildings.find((b) => b.factory === factory && (b.race ?? 0) === race) : undefined);
</script>

{#if d}
  {#if kind === "unit"}
    {@const u = d.units[index]}
    {@const src = sprite("units", u.key)}
    {@const maker = makerOf(u.factory, u.race ?? 0)}
    <span class="tip unlock" class:got>
      {#if src}<img {src} alt={u.name} />{:else}<span class="ab">{abbrev(u.name)}</span>{/if}
      {#if u.litter}<span class="lit num">×{u.litter}</span>{/if}
      <span class="tt">
        <span class="kind">Unité · {client.unitLayerName(u)}</span><br />
        <b>{u.name}</b><br />
        {#if UNIT_DESCS[u.key]}<span class="udesc">{UNIT_DESCS[u.key]}</span><br />{/if}
        <span class="num">PV {u.hp} · {(u.speed / 10).toFixed(1)} c/s{#if !u.litter && u.build} · {u.build} s{/if}</span><br />
        {#if maker}<span class="dim">{u.litter ? "Pondue par" : "Sort de"} : {maker.name}</span><br />{/if}
        {#if u.litter}<span class="good">Portée de {u.litter} œufs</span><br /><span class="dim">La portée, en tout :</span> <Cost cost={u.cost.map(([it, n]): [number, number] => [it, n * u.litter])} have={null} />{:else}<Cost cost={u.cost} have={null} />{/if}
      </span>
    </span>
  {:else if kind === "building"}
    {@const b = d.buildings[index]}
    {@const src = sprite("buildings", b.key)}
    <span class="tip unlock" class:got>
      {#if src}<img {src} alt={b.name} />{:else}<span class="ab">{abbrev(b.name)}</span>{/if}
      <span class="tt">
        <span class="kind">Bâtiment · {b.w}×{b.h}</span><br />
        <b>{b.name}</b><br />
        {#if BUILDING_DESCS[b.key]}<span class="udesc">{BUILDING_DESCS[b.key]}</span><br />{/if}
        <span class="num">PV {b.hp}{#if b.build} · {b.build} s{/if}</span><br />
        {#if b.powerUse}<span class="dim"><Icon name="power" size={12} /> Consomme {b.powerUse} kW</span><br />{/if}
        {#if b.powerProd}<span class="good"><Icon name="power" size={12} /> Produit {b.powerProd} kW</span><br />{/if}
        {#if b.deposit === 255}<span class="dim">Se pose sur un gisement</span><br />{/if}
        {#if b.deposit === 4}<span class="dim">Se pose sur un gisement d'hydrocarbure</span><br />{/if}
        {#if b.water}<span class="dim">Se pose sur l'eau</span><br />{/if}
        <Cost cost={b.cost} have={null} />
      </span>
    </span>
  {:else}
    {@const m = d.mods[index]}
    <span class="tip unlock mod" class:got>
      <span class="ab"><Icon name={m.icon} size={20} /></span>
      <span class="tt">
        <span class="kind">Amélioration · {d.units[m.host]?.name ?? ""}{#if m.rank > 1} · rang {m.rank}{/if}</span><br />
        <b>{m.name}</b><br />
        <span class="udesc">{m.desc}</span><br />
        <span class="num dim">{m.time} s</span><br />
        <Cost cost={m.cost} have={null} />
      </span>
    </span>
  {/if}
{/if}

<style>
  .unlock { display: inline-grid; place-items: center; width: var(--unlock, 38px); height: var(--unlock, 38px); background: rgba(3, 8, 14, 0.7); border: 1px solid var(--line); cursor: help; flex-shrink: 0; }
  .unlock:hover { border-color: var(--line-hi); filter: drop-shadow(0 0 6px rgba(62, 240, 255, 0.35)); }
  .unlock.got { border-color: rgba(77, 255, 176, 0.45); }
  .unlock img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .ab { font-size: 11px; font-weight: 600; color: var(--dim); letter-spacing: 0.04em; display: grid; place-items: center; }
  .unlock.mod .ab { color: var(--amber); }
  .lit { position: absolute; right: 1px; bottom: 0; font-size: 9px; color: var(--good); text-shadow: 0 0 3px #000, 0 0 3px #000; }
  .kind { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); }
  .udesc { color: var(--dim); }
</style>
