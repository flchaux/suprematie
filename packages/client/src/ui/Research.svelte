<script lang="ts">
  import { ui, hasTechUI } from "../game/state.svelte.ts";
  import { client } from "../game/client.ts";
  import Item from "./Item.svelte";
  import Icon from "./Icon.svelte";
  import { PACK1, ADN, RELEVES, RACE_SOUCHE, RACE_TRANSH } from "@supreme/shared";
  import { keyOf } from "../game/keys.svelte.ts";
  const d = $derived(ui.data);
  // recherches de la race du joueur seulement ; paliers présents dans son arbre
  const mine = $derived(d ? d.techs.map((t, i) => ({ t, i })).filter(({ t, i }) => i > 0 && (t.race ?? 0) === ui.race) : []);
  const tiers = $derived([...new Set(mine.map(({ t }) => t.tier))].sort((a, b) => a - b));
  const doneCount = $derived(mine.filter(({ i }) => hasTechUI(i)).length);
  /** recherche interdite par un choix exclusif déjà fait ou prévu (Souche) */
  const barred = (i: number): boolean => {
    const x = d?.techs[i].excl ?? 0;
    return x > 0 && (hasTechUI(x) || ui.research === x || ui.researchQueue.includes(x));
  };
  /** prérequis acquis : d'une paire de mutations exclusives, l'une des deux suffit */
  const met = (p: number): boolean => hasTechUI(p) || ((d?.techs[p].excl ?? 0) > 0 && hasTechUI(d!.techs[p].excl));
  /** prérequis en clair : « Écailles ou Sève vive » pour une paire de mutations exclusives */
  const prereqText = (ps: number[]): string =>
    ps
      .filter((p) => !(d!.techs[p].excl && ps.includes(d!.techs[p].excl) && d!.techs[p].excl < p))
      .map((p) => (d!.techs[p].excl ? `${d!.techs[p].name} ou ${d!.techs[d!.techs[p].excl].name}` : d!.techs[p].name))
      .join(", ");
  /** coût d'une unité de recherche selon la race */
  const unitCost = (tier: number): string => (ui.race === RACE_SOUCHE ? `${tier} ADN` : ui.race === RACE_TRANSH ? `${3 * tier} relevés` : "");
</script>

<div class="modal panel">
  <button class="close ghost icon-btn" onclick={() => (ui.showResearch = false)} title={keyOf("research") ? `Fermer (${keyOf("research")})` : "Fermer"}><Icon name="close" /></button>
  <div class="modal-head">
    <Icon name="research" size={26} />
    <div>
      <div class="kicker">{ui.race === RACE_SOUCHE ? "Matrices" : ui.race === RACE_TRANSH ? "Laboratoires nomades" : "Laboratoires"}</div>
      <h2>Recherche</h2>
    </div>
    <div class="grow"></div>
    {#if d}<span class="dim num">{doneCount}/{mine.length} terminées</span>{/if}
  </div>
  <div class="modal-body">
    <p class="dim intro">
      {#if ui.race === RACE_SOUCHE}Les matrices évoluent avec l'ADN : chaque unité de recherche coûte autant d'ADN que son palier. L'ADN vient des ennemis et des bêtes digérés sur votre terreau ; à défaut, une matrice en tire de la sève (20 pour 1). Les mutations s'excluent deux à deux : le choix vaut pour toute la partie.
      {:else if ui.race === RACE_TRANSH}Les laboratoires nomades étudient vos relevés : chaque unité de recherche coûte 3 relevés par palier. Les relevés viennent de l'exploration (cases découvertes) et des ennemis détruits ; à défaut, un laboratoire en tire un des environs toutes les 2 s. La plupart des recherches débloquent des <b>améliorations</b> : elles s'installent ensuite une à une, depuis la fiche de l'Arche, d'un module ou d'une unité, et coûtent aussi des relevés.
      {:else}Les laboratoires consomment les lots de données apportés par des bras. Une recherche d'un palier demande aussi les lots des paliers inférieurs.{/if}
      <br />Clic : ajouter à la file (avec les recherches préalables) ou retirer de la file · Maj+clic : lancer tout de suite. {#if ui.researchQueue.length}<button class="ghost small linkish" onclick={() => client.clearResearchQueue()}>Vider la file ({ui.researchQueue.length})</button>{/if}</p>
    {#if d}
      <div class="cols">
        {#each tiers as tier}
          <div class="col">
            <h3><Item id={ui.race === RACE_SOUCHE ? ADN : ui.race === RACE_TRANSH ? RELEVES : PACK1 + tier - 1} size={26} /> <span>Palier {tier}</span></h3>
            {#each mine.filter(({ t }) => t.tier === tier) as { t, i }}
              {@const done = hasTechUI(i)}
              {@const excluded = !done && barred(i)}
              {@const avail = !done && !excluded && t.prereq.every(met)}
              {@const cur = ui.research === i}
              {@const qn = ui.researchQueue.indexOf(i) + 1}
              <button class="tech" class:done class:cur class:avail class:queued={qn > 0} class:excluded disabled={done || excluded || ui.me < 0} onclick={(e) => (e.shiftKey && avail ? client.research(i) : client.queueResearch(i))}>
                <span class="tt-head">
                  <b>{t.name}</b>
                  {#if done}<span class="st good"><Icon name="check" size={13} /></span>{:else if qn}<span class="qn num" title="Position dans la file">{qn}</span>{:else if !avail}<span class="st faint"><Icon name="lock" size={12} /></span>{/if}
                </span>
                <span class="desc">{t.desc}</span>
                <span class="meta num">{t.count} × {t.time} s{#if unitCost(t.tier)} · {t.count} × {unitCost(t.tier)}{/if}{#if excluded}<span class="faint"> · exclue par {d.techs[t.excl].name}</span>{/if}{#if t.prereq.length}<span class="faint"> · après {prereqText(t.prereq)}</span>{/if}</span>
                {#if cur}<span class="bar amber"><span style:width={(ui.researchProgress / t.count) * 100 + "%"}></span></span>{/if}
              </button>
            {/each}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .modal-head :global(.ic) { color: var(--accent); }
  .intro { margin: 0 0 14px; }
  .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  .tech.excluded { text-decoration: line-through; text-decoration-color: rgba(255, 255, 255, 0.25); }
  .col { display: flex; flex-direction: column; gap: 6px; }
  h3 { margin: 0 0 4px; font-size: 13px; display: flex; align-items: center; gap: 6px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
  .tech { display: flex; flex-direction: column; align-items: stretch; text-align: left; gap: 3px; padding: 8px 9px; font-weight: 400; letter-spacing: 0; }
  .tt-head { display: flex; justify-content: space-between; gap: 6px; align-items: flex-start; }
  .tt-head b { font-weight: 600; letter-spacing: 0.03em; font-size: 12.5px; }
  .desc { font-size: 11px; color: var(--dim); line-height: 1.3; }
  .meta { font-size: 10px; color: var(--dim); }
  .tech.avail { --b-line: rgba(62, 240, 255, 0.45); }
  .tech.done { --b-line: rgba(77, 255, 176, 0.35); --b-bg: rgba(20, 50, 40, 0.5); opacity: 1; }
  .tech.done:disabled { opacity: 0.75; }
  .tech.cur { --b-line: var(--amber); --b-bg: rgba(60, 44, 16, 0.75); filter: drop-shadow(0 0 8px rgba(255, 181, 71, 0.35)); opacity: 1; }
  .tech:disabled:not(.done):not(.cur) { opacity: 0.62; }
  .tech:disabled:not(.done):not(.cur) .meta .faint { color: var(--dim); }
  .tech.queued { --b-line: rgba(255, 181, 71, 0.55); }
  .qn { min-width: 18px; height: 18px; display: grid; place-items: center; font-size: 11px; font-weight: 700; color: var(--accent-ink, #04121a); background: var(--amber); }
  .linkish { margin-left: 6px; padding: 1px 6px; font-size: 11px; }
  .bar { width: 100%; margin-top: 3px; }
  .bar > span { display: block; height: 100%; background: var(--amber); box-shadow: 0 0 6px var(--amber); }
</style>
