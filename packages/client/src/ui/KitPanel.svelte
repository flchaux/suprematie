<script lang="ts">
  // Gabarits d'équipement d'un type d'unité des Transhumants : trois configurations à enregistrer, celle que
  // l'atelier produit, et l'équipement de la sélection en un ordre. Règles : sim/src/gabarits.rs.
  import { ui, hasTechUI } from "../game/state.svelte.ts";
  import { client } from "../game/client.ts";
  import Icon from "./Icon.svelte";
  import Cost from "./Cost.svelte";
  import type { ModInfo } from "@supreme/shared";
  import { emptyKit, kitChoices, kitCost, kitsOf, slotsOf, type KitSet } from "../game/kits.ts";

  // `refs` : unités sélectionnées de ce type (vide : dans la fiche d'un atelier) ; `current` : équipement de la première
  let { kind, kits, reach, refs = [], current = [] }: { kind: number; kits: ModInfo["kits"]; reach: number[]; refs?: number[]; current?: number[] } = $props();
  const d = $derived(ui.data!);
  const k = $derived(kitsOf(kits, kind));
  let tab = $state(-1);
  /** gabarit montré : celui qu'on a choisi, sinon celui de la production, sinon le premier */
  const at = $derived(tab >= 0 ? tab : Math.max(0, k.active - 1));
  // choix affichés tout de suite, le temps que la simulation les confirme
  let draft = $state<{ kind: number; at: number; set: KitSet; t: number } | null>(null);
  const set = $derived<KitSet>(draft && draft.kind === kind && draft.at === at && performance.now() - draft.t < 800 ? draft.set : k.sets[at]);
  const total = $derived(kitCost(d, set));
  const ROMAN = ["I", "II", "III"];
  const choose = (slot: number, m: number) => {
    const next = [...set] as KitSet;
    next[slot] = next[slot] === m ? 0 : m;
    draft = { kind, at, set: next, t: performance.now() };
    client.kitSet(kind, at, next);
  };
  const copy = () => {
    const next: KitSet = [current[0] ?? 0, current[1] ?? 0, current[2] ?? 0];
    draft = { kind, at, set: next, t: performance.now() };
    client.kitSet(kind, at, next);
  };
</script>

<div class="kit">
  <div class="kh">
    <span class="kicker">Gabarits</span>
    {#each k.sets as s, i}
      <button class="kt" class:on={at === i} class:prod={k.active === i + 1} class:void={emptyKit(s)} title={k.active === i + 1 ? "Gabarit de production" : emptyKit(s) ? "Gabarit vide" : "Gabarit enregistré"} onclick={() => (tab = i)}>
        {ROMAN[i]}{#if k.active === i + 1}<span class="star"><Icon name="check" size={9} stroke={2.6} /></span>{/if}
      </button>
    {/each}
    <span class="grow"></span>
    <button class="icon-btn small" class:on={k.active === at + 1} disabled={emptyKit(set)} title="L'atelier sort ce type d'unité déjà équipé (payé au début, relevés compris)" onclick={() => client.kitActive(kind, k.active === at + 1 ? 0 : at + 1)}><Icon name="factory" size={13} /> {k.active === at + 1 ? "Produit ainsi" : "Produire ainsi"}</button>
  </div>
  {#each slotsOf(d, kind) as sl, si}
    <div class="kr">
      <span class="kl"><Icon name={sl.icon} size={13} /> {sl.name}</span>
      {#each kitChoices(d, kind, si) as { m, i } (i)}
        {@const ok = hasTechUI(m.tech)}
        <div class="tip">
          <button class="kb" class:on={set[si] === i} class:locked={!ok} data-kit={m.key} aria-label={m.name} onclick={() => choose(si, i)}><Icon name={m.icon} size={17} />{#if !ok}<span class="mk"><Icon name="lock" size={9} /></span>{/if}</button>
          <div class="tt"><b>{m.name}</b><br />{m.desc}<br />{#if !ok}<span class="bad">Recherche : {d.techs[m.tech].name}</span><br />{/if}<Cost cost={m.cost} have={reach} /></div>
        </div>
      {/each}
      <span class="kn dim">{set[si] ? d.mods[set[si]].name : "rien"}</span>
    </div>
  {/each}
  <div class="kf">
    {#if emptyKit(set)}<span class="dim small">Choisissez un équipement par emplacement.</span>
    {:else}<Cost cost={total.cost} have={reach} /><span class="dim small num">+{total.time} s</span>{/if}
    <span class="grow"></span>
    {#if refs.length}
      <button class="icon-btn small" title="Enregistrer l'équipement de cette unité dans ce gabarit" onclick={copy}><Icon name="copy" size={13} /> Copier</button>
      <button class="icon-btn small go" disabled={emptyKit(set)} title="Installe ce qui manque, dès que les réserves à portée le permettent" onclick={() => client.kitApply(set, refs)}><Icon name="mod_fit" size={13} /> Équiper{refs.length > 1 ? ` les ${refs.length}` : ""}</button>
    {/if}
  </div>
</div>

<style>
  .kit { display: flex; flex-direction: column; gap: 4px; padding: 6px 0 2px; border-top: 1px solid var(--line); }
  .kh, .kr, .kf { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
  .grow { flex: 1; }
  .kt { position: relative; min-width: 28px; padding: 2px 6px; font-size: 11px; font-weight: 700; clip-path: none; }
  .kt.void:not(.on) { opacity: 0.55; }
  .kt.prod { --b-line: var(--good); }
  .star { position: absolute; right: -2px; top: -4px; color: var(--good); line-height: 1; }
  .kl { display: inline-flex; align-items: center; gap: 4px; width: 92px; font-size: 11px; color: var(--amber); }
  .kb { position: relative; width: 29px; height: 27px; padding: 0; display: grid; place-items: center; color: var(--dim); }
  .kb.on { color: var(--accent-ink, #04121a); background: var(--accent); --b-line: var(--accent); }
  .kb.locked { opacity: 0.6; }
  .mk { position: absolute; right: 0; top: 0; line-height: 1; }
  .kn { font-size: 10.5px; }
  .kf { min-height: 24px; }
  .kf :global(.cost) { display: inline-flex; flex-wrap: wrap; gap: 6px; }
  .kf :global(.cost .name) { display: none; }
  .go { color: var(--good); }
</style>
