<script lang="ts">
  // Carte d'une recherche : nom, état, effet, ce qu'elle débloque (vignettes avec fiche au survol), durée et
  // coût, prérequis. Clic : en file avec ses prérequis, ou retirée de la file ; Maj+clic : lancée tout de suite.
  import { ui, hasTechUI } from "../game/state.svelte.ts";
  import { client } from "../game/client.ts";
  import Icon from "./Icon.svelte";
  import Unlock from "./Unlock.svelte";
  import { RACE_SOUCHE, RACE_TRANSH } from "@supreme/shared";
  import { techStatus, techUnlocks, prereqText } from "../game/research.ts";

  /** `tiers` : nommer le palier des prérequis (ils sont dans un autre onglet) */
  let { tech, tiers = false }: { tech: number; tiers?: boolean } = $props();
  const d = $derived(ui.data!);
  const t = $derived(d.techs[tech]);
  const status = $derived(techStatus(d, { has: hasTechUI, current: ui.research, queue: ui.researchQueue }, tech));
  const unlocks = $derived(techUnlocks(d, tech));
  const qn = $derived(ui.researchQueue.indexOf(tech) + 1);
  const done = $derived(status === "done");
  /** coût d'une unité de recherche selon la race */
  const unitCost = (tier: number): string => (ui.race === RACE_SOUCHE ? `${tier} ADN` : ui.race === RACE_TRANSH ? `${3 * tier} relevés` : "");
</script>

<div class="rcard" class:done class:cur={status === "current"} class:avail={status === "available"} class:queued={status === "queued"} class:excluded={status === "barred"} class:locked={status === "locked"}>
  <button class="body" disabled={done || status === "barred" || ui.me < 0} onclick={(e) => (e.shiftKey && status === "available" ? client.research(tech) : client.queueResearch(tech))}>
    <span class="head">
      <b>{t.name}</b>
      {#if done}<span class="st good"><Icon name="check" size={13} /></span>{:else if qn}<span class="qn num" title="Position dans la file">{qn}</span>{:else if status === "locked" || status === "barred"}<span class="st faint"><Icon name="lock" size={12} /></span>{/if}
    </span>
    <span class="desc">{t.desc}</span>
    <span class="meta num"><span>{t.count} × {t.time} s</span>{#if unitCost(t.tier)}<span>· {t.count} × {unitCost(t.tier)}</span>{/if}{#if status === "barred"}<span class="faint">· exclue par {d.techs[t.excl].name}</span>{/if}{#if t.prereq.length}<span class="faint">· après {prereqText(d, t.prereq, tiers)}</span>{/if}</span>
    {#if status === "current"}<span class="bar amber"><span style:width={(ui.researchProgress / t.count) * 100 + "%"}></span></span>{/if}
  </button>
  {#if unlocks.units.length + unlocks.buildings.length + unlocks.mods.length}
    <div class="unlocks">
      <span class="lab">{done ? "Débloqué" : "Débloque"}</span>
      {#each unlocks.buildings as i}<Unlock kind="building" index={i} got={done} />{/each}
      {#each unlocks.units as i}<Unlock kind="unit" index={i} got={done} />{/each}
      {#each unlocks.mods as i}<Unlock kind="mod" index={i} got={done} />{/each}
    </div>
  {/if}
</div>

<style>
  .rcard { --c-line: var(--line); display: flex; flex-direction: column; border: 1px solid var(--c-line); background: rgba(12, 22, 33, 0.72); min-width: 0; }
  .body { display: flex; flex-direction: column; align-items: stretch; text-align: left; gap: 4px; padding: 9px 10px; font-weight: 400; letter-spacing: 0; flex: 1; --b-bg: transparent; --b-line: transparent; clip-path: none; }
  .head { display: flex; justify-content: space-between; gap: 6px; align-items: flex-start; }
  .head b { font-weight: 600; letter-spacing: 0.03em; font-size: 13px; }
  .desc { font-size: 11.5px; color: var(--dim); line-height: 1.35; }
  .meta { font-size: 10px; color: var(--dim); display: flex; flex-wrap: wrap; column-gap: 5px; }
  .unlocks { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; padding: 7px 10px 9px; border-top: 1px dashed var(--line); }
  .lab { font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--faint); margin-right: 2px; }
  .rcard.avail { --c-line: rgba(62, 240, 255, 0.45); }
  .rcard.done { --c-line: rgba(77, 255, 176, 0.35); background: rgba(20, 50, 40, 0.5); }
  .rcard.done .body:disabled { opacity: 0.85; }
  .rcard.done .lab { color: var(--good); }
  .rcard.cur { --c-line: var(--amber); background: rgba(60, 44, 16, 0.75); filter: drop-shadow(0 0 8px rgba(255, 181, 71, 0.35)); }
  .rcard.queued { --c-line: rgba(255, 181, 71, 0.55); }
  .rcard.locked .body, .rcard.excluded .body { opacity: 0.7; }
  .rcard.excluded .head b { text-decoration: line-through; text-decoration-color: rgba(255, 255, 255, 0.3); }
  .qn { min-width: 18px; height: 18px; display: grid; place-items: center; font-size: 11px; font-weight: 700; color: var(--accent-ink, #04121a); background: var(--amber); }
  .bar { width: 100%; margin-top: 3px; }
  .bar > span { display: block; height: 100%; background: var(--amber); box-shadow: 0 0 6px var(--amber); }
</style>
