<script lang="ts">
  // Panneau de recherche, par onglets. Industriels et Transhumants : un onglet par palier. Souche : un onglet
  // « Mutations » (l'arbre, MutationTree.svelte) et un onglet « Recherche ». Une bande au-dessus des onglets
  // montre la recherche en cours et la file, qui portent sur tous les onglets. Chaque recherche montre ce
  // qu'elle débloque (ResearchCard.svelte). Onglets et états : game/research.ts.
  import { untrack } from "svelte";
  import { ui, hasTechUI } from "../game/state.svelte.ts";
  import { client } from "../game/client.ts";
  import Item from "./Item.svelte";
  import Icon from "./Icon.svelte";
  import ResearchCard from "./ResearchCard.svelte";
  import MutationTree from "./MutationTree.svelte";
  import { PACK1, ADN, RELEVES, RACE_SOUCHE, RACE_TRANSH } from "@supreme/shared";
  import { keyOf } from "../game/keys.svelte.ts";
  import { researchTabs, defaultTab, techStatus, raceTechs, type ResearchState, type ResearchTab } from "../game/research.ts";

  const d = $derived(ui.data);
  const st = $derived<ResearchState>({ has: hasTechUI, current: ui.research, queue: ui.researchQueue });
  const mine = $derived(d ? raceTechs(d, ui.race) : []);
  const doneCount = $derived(mine.filter((i) => hasTechUI(i)).length);
  const tabs = $derived(d ? researchTabs(d, ui.race) : []);
  // onglet d'ouverture : celui de la recherche en cours, sinon le premier où l'on peut chercher ; ensuite, le choix du joueur
  let picked = $state(untrack(() => (ui.data ? defaultTab(ui.data, { has: hasTechUI, current: ui.research, queue: ui.researchQueue }, researchTabs(ui.data, ui.race)) : "")));
  const tab = $derived(tabs.find((t) => t.id === picked) ?? tabs[0]);
  /** paliers présents dans un onglet qui en réunit plusieurs (Souche, « Recherche ») */
  const tiersOf = (t: ResearchTab) => [...new Set(t.techs.map((i) => d!.techs[i].tier))].sort((a, b) => a - b);
  const doneIn = (t: ResearchTab) => t.techs.filter((i) => hasTechUI(i)).length;
  const busyIn = (t: ResearchTab) => (ui.research > 0 && t.techs.includes(ui.research) ? 1 : 0) + t.techs.filter((i) => ui.researchQueue.includes(i)).length;
  const openIn = (t: ResearchTab) => t.techs.some((i) => techStatus(d!, st, i) === "available");
  /** montre l'onglet d'une recherche (clic dans la bande de la file) */
  const show = (tech: number) => {
    const t = tabs.find((x) => x.techs.includes(tech));
    if (t) picked = t.id;
  };
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
  {#if d}
    <div class="queue">
      {#if ui.research > 0}
        {@const t = d.techs[ui.research]}
        <button class="chip cur" onclick={() => show(ui.research)} title="Recherche en cours : voir son onglet">
          <span class="lab">En cours</span><b>{t.name}</b>
          <span class="bar amber"><span style:width={(ui.researchProgress / t.count) * 100 + "%"}></span></span>
          <span class="num pr">{ui.researchProgress}/{t.count}</span>
        </button>
      {:else}
        <span class="idle dim">Aucune recherche en cours</span>
      {/if}
      {#each ui.researchQueue as q, n}
        <span class="chip">
          <button class="go" onclick={() => show(q)} title="Voir son onglet"><span class="qn num">{n + 1}</span>{d.techs[q].name}</button>
          <button class="rm" onclick={() => client.queueResearch(q)} title="Retirer de la file"><Icon name="close" size={11} /></button>
        </span>
      {/each}
      {#if ui.researchQueue.length > 1}<button class="ghost small clear" onclick={() => client.clearResearchQueue()}>Vider la file</button>{/if}
    </div>
    <div class="tabs" role="tablist">
      {#each tabs as t}
        {@const busy = busyIn(t)}
        <button class="rtab" class:on={tab?.id === t.id} class:open={openIn(t)} class:mutations={t.kind === "mutations"} role="tab" aria-selected={tab?.id === t.id} onclick={() => (picked = t.id)}>
          {#if t.kind === "mutations"}<Icon name="dna" size={18} />
          {:else if t.kind === "research"}<Item id={ADN} size={20} />
          {:else}<Item id={ui.race === RACE_TRANSH ? RELEVES : PACK1 + t.tier - 1} size={20} />{/if}
          <span class="tl">{t.label}</span>
          <span class="tc num">{doneIn(t)}/{t.techs.length}</span>
          {#if busy}<span class="tb num" title="Recherches de cet onglet en cours ou en file">{busy}</span>{/if}
        </button>
      {/each}
    </div>
  {/if}
  <div class="modal-body">
    {#if d && tab}
      {#if tab.kind !== "mutations"}
        <p class="dim intro">
          {#if ui.race === RACE_SOUCHE}Les matrices évoluent avec l'ADN : chaque unité de recherche coûte autant d'ADN que son palier. L'ADN vient des ennemis et des bêtes digérés sur votre terreau ; à défaut, une matrice en tire de la sève (20 pour 1).
          {:else if ui.race === RACE_TRANSH}Les laboratoires nomades étudient vos relevés : chaque unité de recherche coûte 3 relevés par palier. Les relevés viennent de l'exploration (cases découvertes) et des ennemis détruits ; à défaut, un laboratoire en tire un des environs toutes les 2 s. La plupart des recherches débloquent des <b>améliorations</b> : elles s'installent ensuite une à une, depuis la fiche de l'Arche, d'un module ou d'une unité, et coûtent aussi des relevés.
          {:else}Les laboratoires consomment les lots de données apportés par des bras. Une recherche d'un palier demande aussi les lots des paliers inférieurs.{/if}
          <br />Clic : ajouter à la file (avec les recherches préalables) ou retirer de la file · Maj+clic : lancer tout de suite · survol d'une vignette : la fiche de ce qui est débloqué.
        </p>
      {/if}
      {#if tab.kind === "mutations"}
        <MutationTree />
      {:else if tab.kind === "tier"}
        <div class="grid">{#each tab.techs as i (i)}<ResearchCard tech={i} tiers />{/each}</div>
      {:else}
        {#each tiersOf(tab) as tier}
          <h3><span>Palier {tier}</span></h3>
          <div class="grid">{#each tab.techs.filter((i) => d.techs[i].tier === tier) as i (i)}<ResearchCard tech={i} />{/each}</div>
        {/each}
      {/if}
    {/if}
  </div>
</div>

<style>
  .modal-head { margin-bottom: 10px; }
  .modal-head :global(.ic) { color: var(--accent); }
  .intro { margin: 0 0 10px; font-size: 12px; line-height: 1.45; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; align-items: stretch; }
  h3 { margin: 14px 0 8px; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--dim); display: flex; align-items: center; gap: 10px; }
  h3::after { content: ""; flex: 1; border-top: 1px solid var(--line); }
  h3:first-of-type { margin-top: 0; }

  /* recherche en cours et file : elles portent sur tous les onglets */
  .queue { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 30px; margin-bottom: 10px; flex-shrink: 0; }
  .idle { font-size: 12px; }
  .chip { display: inline-flex; align-items: stretch; font-size: 12px; }
  .chip.cur { --b-bg: rgba(60, 44, 16, 0.8); --b-line: var(--amber); align-items: center; gap: 8px; padding: 4px 10px; }
  .chip.cur .lab { font-size: 9.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--amber); }
  .chip.cur .bar { width: 90px; }
  .chip.cur .bar > span { display: block; height: 100%; background: var(--amber); box-shadow: 0 0 6px var(--amber); }
  .pr { font-size: 10.5px; color: var(--dim); }
  .chip .go { --b-line: rgba(255, 181, 71, 0.5); display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px 4px 5px; clip-path: none; }
  .chip .rm { --b-line: rgba(255, 181, 71, 0.5); padding: 4px 6px; margin-left: -1px; display: inline-grid; place-items: center; color: var(--dim); }
  .chip .rm:hover { color: var(--bad); }
  .qn { min-width: 17px; height: 17px; display: grid; place-items: center; font-size: 10.5px; font-weight: 700; color: var(--accent-ink, #04121a); background: var(--amber); }
  .clear { font-size: 11px; padding: 3px 8px; }

  /* onglets */
  .tabs { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px; border-bottom: 1px solid var(--line); flex-shrink: 0; }
  .rtab { --b-bg: rgba(14, 24, 36, 0.7); display: inline-flex; align-items: center; gap: 7px; padding: 7px 13px 8px; font-size: 12.5px; clip-path: none; margin-bottom: -1px; opacity: 0.72; }
  .rtab.open { opacity: 1; }
  .rtab.on { opacity: 1; }
  .rtab.on .tc { color: rgba(255, 255, 255, 0.8); }
  /* l'onglet des mutations porte le vert acide de la Souche */
  .rtab.mutations :global(.ic) { color: #b9f24a; }
  .rtab.mutations.on { background: linear-gradient(180deg, rgba(185, 242, 74, 0.34), rgba(120, 170, 40, 0.2)) padding-box, linear-gradient(#b9f24a, #b9f24a) border-box; box-shadow: none; }
  .rtab.mutations.on :global(.ic) { color: #fff; }
  .tl { font-weight: 600; letter-spacing: 0.05em; }
  .tc { font-size: 10.5px; color: var(--dim); }
  .tb { min-width: 16px; height: 16px; padding: 0 3px; display: grid; place-items: center; font-size: 10px; font-weight: 700; color: var(--accent-ink, #04121a); background: var(--amber); }
</style>
