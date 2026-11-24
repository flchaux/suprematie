<script lang="ts">
  // Arbre des mutations de la Souche : un brin d'ADN descend de stade en stade ; à chaque stade, deux
  // mutations s'excluent. La mutation acquise s'allume et porte le brin, sa jumelle s'éteint pour la partie.
  // Au survol d'une mutation encore possible, l'arbre montre ce que le choix coûte (la jumelle se flétrit et
  // porte la mention « perdue ») et ce qu'il ouvre (le stade suivant s'éclaire) ; l'encadré du génome le dit
  // en clair. À droite, le génome : ce qui est acquis, ce à quoi on a renoncé, les nids greffés permis.
  // Structure : game/research.ts.
  import { ui, hasTechUI } from "../game/state.svelte.ts";
  import { client } from "../game/client.ts";
  import Icon from "./Icon.svelte";
  import Item from "./Item.svelte";
  import ResearchCard from "./ResearchCard.svelte";
  import { ADN } from "@supreme/shared";
  import { mutationTree, techStatus, mutationEffect, mutationFigure, genome, prereqText, type MutationStage, type ResearchState } from "../game/research.ts";

  const d = $derived(ui.data!);
  const st = $derived<ResearchState>({ has: hasTechUI, current: ui.research, queue: ui.researchQueue });
  const tree = $derived(mutationTree(d, ui.race));
  const trunk = $derived(tree.chains[0]?.stages ?? []);
  const sides = $derived(tree.chains.slice(1));
  const g = $derived(genome(d, st, ui.race));
  /** mutation survolée (0 : aucune) */
  let hover = $state(0);

  const status = (i: number) => techStatus(d, st, i);
  /** le choix se fait encore : la mutation n'est ni acquise ni écartée */
  const open = (i: number) => ["available", "locked", "queued", "current"].includes(status(i));
  /** une mutation de ce stade est acquise : le brin continue */
  const settled = (stage: MutationStage) => stage.pair.some((i) => hasTechUI(i));
  /** stade qui suit dans sa lignée */
  const nextOf = (stage: MutationStage, chain: MutationStage[]) => chain[chain.indexOf(stage) + 1];
  /** ce que le survol annonce : la mutation visée, celle qu'elle éteint, ce qu'elle ouvre */
  const preview = $derived.by(() => {
    if (!hover || !open(hover)) return null;
    for (const chain of tree.chains) {
      const stage = chain.stages.find((x) => x.pair.includes(hover));
      if (!stage || settled(stage)) continue;
      return { pick: hover, lost: d.techs[hover].excl, next: nextOf(stage, chain.stages), finals: stage.finals };
    }
    return null;
  });
  /** stade que le survol ouvrirait */
  const wouldOpen = (stage: MutationStage, chain: MutationStage[]) => {
    const prev = chain[chain.indexOf(stage) - 1];
    return !!prev && prev.pair.includes(hover) && open(hover) && !settled(prev);
  };
  /** état d'une branche du nœud, vers la mutation de ce côté */
  const branch = (i: number) => {
    const s = status(i);
    return s === "done" ? "on" : s === "barred" ? "off" : s === "current" || s === "queued" ? "going" : "maybe";
  };
  /** titre d'un gène à part, d'après la recherche qu'il demande */
  const GENE: Record<string, string> = { s_brambles: "Gène des racines" };
  const geneTitle = (stage: MutationStage) => stage.needs.map((n) => GENE[d.techs[n].key]).find((x) => x) ?? "Gène à part";
  const click = (e: MouseEvent, i: number) => (e.shiftKey && status(i) === "available" ? client.research(i) : client.queueResearch(i));
</script>

{#snippet allele(i: number, side: "left" | "right", after: string)}
  {@const t = d.techs[i]}
  {@const s = status(i)}
  {@const twin = t.excl}
  {@const dead = s === "barred" && hasTechUI(twin)}
  {@const fig = mutationFigure(t.desc)}
  {@const qn = ui.researchQueue.indexOf(i) + 1}
  {@const dying = preview?.lost === i}
  <button
    class="allele"
    class:right={side === "right"}
    class:done={s === "done"}
    class:cur={s === "current"}
    class:queued={s === "queued"}
    class:avail={s === "available"}
    class:locked={s === "locked"}
    class:dead
    class:aside={s === "barred" && !dead}
    class:would-die={dying}
    disabled={s === "done" || s === "barred" || ui.me < 0}
    onmouseenter={() => (hover = i)}
    onmouseleave={() => { if (hover === i) hover = 0; }}
    onfocus={() => (hover = i)}
    onblur={() => { if (hover === i) hover = 0; }}
    onclick={(e) => click(e, i)}
  >
    <span class="fig num">{#if fig}{fig}{:else}<Icon name="dna" size={28} />{/if}</span>
    <span class="txt">
      <span class="name">
        <b>{t.name}</b>
        {#if s === "done"}<span class="tag good"><Icon name="check" size={12} /> acquise</span>
        {:else if dead}<span class="tag gone">éteinte</span>
        {:else if s === "barred"}<span class="tag gone">écartée</span>
        {:else if s === "current"}<span class="tag amber">en cours</span>
        {:else if qn}<span class="qn num" title="Position dans la file">{qn}</span>
        {:else if s === "locked"}<span class="tag faint"><Icon name="lock" size={11} /></span>
        {:else}<span class="tag live">possible</span>{/if}
      </span>
      <span class="eff">{mutationEffect(t.desc)}</span>
      <span class="meta num">
        <Item id={ADN} size={14} /> {t.count * t.tier} ADN · {t.count * t.time} s
        {#if dead}<span class="why">· {d.techs[twin].name} est acquise</span>
        {:else if s === "barred"}<span class="why">· {d.techs[twin].name} est prévue</span>
        {:else if s === "locked"}<span class="why">· après {after}</span>{/if}
      </span>
      {#if s === "current"}<span class="prog"><span style:width={(ui.researchProgress / t.count) * 100 + "%"}></span></span>{/if}
    </span>
    {#if dying}<span class="stamp">perdue pour la partie</span>{/if}
  </button>
{/snippet}

{#snippet stageRow(stage: MutationStage, after: string)}
  {@const [a, b] = stage.pair}
  <div class="row" class:settled={settled(stage)}>
    {@render allele(a, "left", after)}
    <div class="locus" data-l={branch(a)} data-r={branch(b)}><span class="node"></span></div>
    {@render allele(b, "right", after)}
  </div>
{/snippet}

<!-- brin entre deux stades, avec le nom du stade qui suit ; `first` : départ du brin -->
{#snippet link(label: string, tier: number, lit: boolean, opening: boolean, first = false)}
  <div class="link" class:lit class:opening class:first>
    <span class="sn">{label}{#if opening}<span class="opens"> · s'ouvre</span>{/if}</span>
    <svg viewBox="0 0 72 26" width="72" height="24" preserveAspectRatio="none" aria-hidden="true">
      {#if first}<path d="M36 8v18" /><circle cx="36" cy="6" r="3" />
      {:else}<path d="M26 0C26 9 46 17 46 26" /><path d="M46 0C46 9 26 17 26 26" /><path class="rung" d="M30 5h12M33 13h6M30 21h12" />{/if}
    </svg>
    <span class="st num">{#if tier}palier {tier}{/if}</span>
  </div>
{/snippet}

<div class="mut">
  <div class="trunk">
    {#each trunk as stage, k}
      {@render link(`Stade ${k + 1}`, stage.tier, k > 0 && settled(trunk[k - 1]), wouldOpen(stage, trunk), k === 0)}
      {@render stageRow(stage, k > 0 ? `le stade ${k}` : prereqText(d, stage.needs))}
      {#if k === trunk.length - 1 && stage.finals.length}
        {@render link("Forme finale", 0, settled(stage), preview?.finals === stage.finals)}
        <div class="final">{#each stage.finals as f}<ResearchCard tech={f} />{/each}</div>
      {/if}
    {/each}
  </div>

  <aside class="side">
    <section class="genome">
      <h3><Icon name="dna" size={18} /> <span>Votre génome</span> <span class="count num">{g.stages}/{g.total} stades</span></h3>
      <div class="preview" class:show={!!preview}>
        {#if preview}
          {@const pick = d.techs[preview.pick]}
          {@const lost = d.techs[preview.lost]}
          <div class="pk">Si vous choisissez <b>{pick.name}</b></div>
          <div class="pl gain"><span class="sg">+</span><span>{mutationEffect(pick.desc)}</span></div>
          <div class="pl loss"><span class="sg">−</span><span><s>{lost.name}</s> : {mutationEffect(lost.desc)}, perdue pour toute la partie</span></div>
          <div class="pl then"><span class="sg">→</span><span>
            {#if preview.next}ouvre le stade suivant : {d.techs[preview.next.pair[0]].name} ou {d.techs[preview.next.pair[1]].name}
            {:else if preview.finals.length}ouvre {preview.finals.map((f) => d.techs[f].name).join(", ")}
            {:else}dernier stade de ce gène{/if} ; {g.dens + 1} nids greffés au plus</span></div>
        {:else}
          <div class="pk idle">Survolez une mutation pour voir ce qu'elle change : ce que vous gagnez, ce que vous perdez, ce qu'elle ouvre.</div>
        {/if}
      </div>
      {#if g.acquired.length}
        <ul>
          {#each g.acquired as i}<li class="has"><span class="dot"></span><span><b>{d.techs[i].name}</b> {mutationEffect(d.techs[i].desc)}</span></li>{/each}
          {#each g.renounced as i}<li class="lost"><span class="x">✕</span><span><b>{d.techs[i].name}</b> {mutationEffect(d.techs[i].desc)}</span></li>{/each}
        </ul>
      {:else}
        <p class="none">Aucune mutation encore. À chaque stade, vous choisissez entre deux mutations : l'autre est perdue pour toute la partie.</p>
      {/if}
      <div class="dens"><span class="num big">{g.dens}</span><span>nid{g.dens > 1 ? "s" : ""} de la faune greffé{g.dens > 1 ? "s" : ""} au plus<br /><span class="dimmer">un, plus un par mutation acquise</span></span></div>
    </section>

    {#each sides as chain}
      <section class="gene">
        <h3><Icon name="dna" size={16} /> <span>{geneTitle(chain.stages[0])}</span>{#if chain.stages[0].needs.length}<span class="count">après {prereqText(d, chain.stages[0].needs)} · palier {chain.stages[0].tier}</span>{/if}</h3>
        {#each chain.stages as stage, k}
          {#if k > 0}{@render link(`Stade ${k + 1}`, stage.tier, settled(chain.stages[k - 1]), wouldOpen(stage, chain.stages))}{/if}
          {@render stageRow(stage, k > 0 ? `le stade ${k}` : prereqText(d, stage.needs))}
        {/each}
      </section>
    {/each}
    <p class="hint">Chaque mutation change l'espèce entière et se paie en ADN, comme une recherche. Clic : mettre en file ou retirer · Maj+clic : lancer tout de suite. Une mutation en file peut encore être retirée ; une fois acquise, le choix est définitif.</p>
  </aside>
</div>

<style>
  .mut { --gene: #b9f24a; --gene-soft: rgba(185, 242, 74, 0.5); --dead: #55606b; display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(260px, 1fr); gap: 22px; align-items: start; }
  .trunk { display: flex; flex-direction: column; min-width: 0; }
  .row { display: grid; grid-template-columns: minmax(0, 1fr) 72px minmax(0, 1fr); align-items: stretch; }

  /* brin entre deux stades : le nom du stade à gauche, son palier à droite */
  .link { display: grid; grid-template-columns: minmax(0, 1fr) 72px minmax(0, 1fr); align-items: center; height: 24px; }
  .link svg { display: block; }
  .link path, .link circle { fill: none; stroke: rgba(127, 147, 168, 0.45); stroke-width: 2; stroke-dasharray: 3 3; }
  .link .rung { stroke-width: 1.2; stroke-dasharray: none; opacity: 0.5; }
  .link.first path, .link.first circle { stroke-dasharray: none; stroke: var(--gene); }
  .link.first circle { fill: var(--gene); }
  .link.lit path { stroke: var(--gene); stroke-dasharray: none; filter: drop-shadow(0 0 4px var(--gene-soft)); }
  .sn { justify-self: end; padding-right: 10px; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--dim); white-space: nowrap; }
  .st { padding-left: 10px; font-size: 9.5px; color: var(--faint); }
  .link.lit .sn, .link.first .sn { color: var(--gene); }
  .link.opening .sn { color: var(--gene); }
  .opens { letter-spacing: 0.06em; }

  /* nœud du brin : une branche vers chaque mutation */
  .locus { position: relative; }
  .locus::before, .locus::after { content: ""; position: absolute; top: 50%; height: 0; width: 50%; border-top: 2px dashed rgba(127, 147, 168, 0.4); }
  .locus::before { left: 0; }
  .locus::after { right: 0; }
  .node { position: absolute; left: 50%; top: 50%; width: 14px; height: 14px; transform: translate(-50%, -50%) rotate(45deg); background: #0b141d; border: 2px solid rgba(127, 147, 168, 0.6); z-index: 1; }
  .row.settled .node { border-color: var(--gene); background: var(--gene); box-shadow: 0 0 10px var(--gene-soft); }
  .locus[data-l="on"]::before, .locus[data-r="on"]::after { border-top: 3px solid var(--gene); filter: drop-shadow(0 0 5px var(--gene-soft)); margin-top: -1px; }
  .locus[data-l="going"]::before, .locus[data-r="going"]::after { border-top: 2px solid var(--amber); }
  .locus[data-l="off"]::before, .locus[data-r="off"]::after { border-top: 2px dotted var(--dead); opacity: 0.6; }

  /* une mutation */
  .allele { --b-bg: rgb(12, 22, 33); --b-line: var(--line); position: relative; display: grid; grid-template-columns: 70px minmax(0, 1fr); gap: 10px; align-items: center; text-align: left; padding: 8px 11px; font-weight: 400; letter-spacing: 0; min-height: 72px; }
  .allele.right { grid-template-columns: minmax(0, 1fr) 70px; }
  .allele.right .fig { order: 2; }
  .fig { font-size: 22px; font-weight: 600; color: var(--dim); text-align: center; line-height: 1; white-space: nowrap; display: grid; place-items: center; }
  .txt { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .name { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .name b { font-size: 13.5px; font-weight: 600; letter-spacing: 0.03em; }
  .eff { font-size: 11.5px; color: var(--dim); line-height: 1.3; }
  .meta { font-size: 10px; color: var(--dim); display: flex; flex-wrap: wrap; align-items: center; gap: 3px; }
  .why { color: var(--faint); }
  .tag { display: inline-flex; align-items: center; gap: 3px; font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase; white-space: nowrap; }
  .tag.good { color: var(--gene); }
  .tag.live { color: var(--accent); }
  .tag.amber { color: var(--amber); }
  .tag.gone { color: var(--dead); }
  .qn { min-width: 18px; height: 18px; display: grid; place-items: center; font-size: 11px; font-weight: 700; color: var(--accent-ink, #04121a); background: var(--amber); }
  .prog { height: 4px; background: rgba(255, 181, 71, 0.15); margin-top: 2px; }
  .prog > span { display: block; height: 100%; background: var(--amber); box-shadow: 0 0 6px var(--amber); }

  .allele.avail { --b-line: rgba(62, 240, 255, 0.5); animation: breathe 2.4s ease-in-out infinite; }
  .allele.avail .fig { color: var(--text); }
  /* acquise : le brin passe par elle (fond opaque : le trait vif ne doit pas transparaître) */
  .allele.done { --b-bg: #1a280b; --b-line: var(--gene); opacity: 1; filter: drop-shadow(0 0 9px rgba(185, 242, 74, 0.3)); }
  .allele.done .fig, .allele.done .name b { color: var(--gene); }
  .allele.done .eff { color: var(--text); }
  .allele.cur { --b-bg: #33250d; --b-line: var(--amber); opacity: 1; }
  .allele.cur .fig { color: var(--amber); }
  .allele.queued { --b-bg: #1c1a12; --b-line: rgba(255, 181, 71, 0.6); }
  .allele.locked { opacity: 0.72; }
  /* éteinte (l'autre mutation du stade est acquise), écartée (elle est prévue), ou sur le point de l'être (survol) */
  .allele.dead, .allele.aside, .allele.would-die { --b-line: var(--dead); --b-bg: rgb(17, 22, 28); animation: none; }
  .allele.dead, .allele.aside { filter: grayscale(1); }
  .allele.dead::after, .allele.aside::after, .allele.would-die::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(135deg, transparent 0 7px, rgba(255, 255, 255, 0.05) 7px 8px); }
  .allele.dead { opacity: 0.5; }
  .allele.aside { opacity: 0.62; }
  .allele.dead .name b, .allele.aside .name b, .allele.would-die .name b { text-decoration: line-through; text-decoration-color: rgba(255, 255, 255, 0.35); }
  .allele.would-die { opacity: 1; }
  .allele.would-die .txt, .allele.would-die .fig { opacity: 0.35; filter: grayscale(1); }
  .stamp { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) rotate(-5deg); padding: 3px 10px; font-size: 11px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; white-space: nowrap; color: var(--bad); border: 2px solid var(--bad); background: rgba(20, 6, 8, 0.85); z-index: 2; }
  @keyframes breathe { 0%, 100% { filter: drop-shadow(0 0 0 rgba(62, 240, 255, 0)); } 50% { filter: drop-shadow(0 0 8px rgba(62, 240, 255, 0.45)); } }
  @media (prefers-reduced-motion: reduce) { .allele.avail { animation: none; } }

  .final { align-self: center; width: min(100%, 460px); display: flex; flex-direction: column; gap: 8px; }

  /* colonne de droite */
  .side { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
  .side h3 { margin: 0 0 8px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; display: flex; align-items: center; gap: 7px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
  .side h3 :global(.ic) { color: var(--gene); }
  .count { margin-left: auto; font-size: 10.5px; color: var(--dim); letter-spacing: 0.04em; text-transform: none; }
  .genome { padding: 11px 12px; border: 1px solid rgba(185, 242, 74, 0.28); background: linear-gradient(180deg, rgba(30, 44, 12, 0.45), rgba(8, 14, 20, 0.6)); }
  /* ce que le survol annonce ; la place est réservée pour que rien ne bouge */
  .preview { min-height: 104px; margin-bottom: 10px; padding: 8px 9px; border: 1px dashed var(--line); font-size: 11.5px; line-height: 1.35; display: flex; flex-direction: column; gap: 4px; }
  .preview.show { border: 1px solid var(--gene-soft); background: rgba(10, 16, 8, 0.6); }
  .pk { color: var(--text); }
  .pk.idle { color: var(--faint); }
  .pk b { color: var(--gene); font-weight: 600; }
  .pl { display: grid; grid-template-columns: 12px minmax(0, 1fr); gap: 5px; color: var(--dim); }
  .sg { font-weight: 700; }
  .pl.gain { color: var(--text); }
  .pl.gain .sg { color: var(--gene); }
  .pl.loss .sg, .pl.loss s { color: var(--bad); text-decoration-color: var(--bad); }
  .pl.then .sg { color: var(--accent); }
  .none { margin: 0 0 10px; font-size: 11.5px; color: var(--dim); line-height: 1.4; }
  ul { list-style: none; margin: 0 0 10px; padding: 0; display: flex; flex-direction: column; gap: 5px; }
  li { display: grid; grid-template-columns: 14px minmax(0, 1fr); gap: 6px; font-size: 11.5px; line-height: 1.3; color: var(--dim); }
  li b { font-weight: 600; color: var(--text); }
  li.has b { color: var(--gene); }
  .dot { width: 7px; height: 7px; margin-top: 4px; background: var(--gene); box-shadow: 0 0 6px var(--gene-soft); transform: rotate(45deg); }
  li.lost { opacity: 0.6; }
  li.lost b { text-decoration: line-through; color: var(--dim); }
  .x { color: var(--bad); font-size: 10px; line-height: 1.5; }
  .dens { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; align-items: center; padding-top: 9px; border-top: 1px dashed var(--line); font-size: 11.5px; line-height: 1.3; }
  .big { font-size: 26px; font-weight: 600; color: var(--gene); line-height: 1; }
  .dimmer { color: var(--faint); font-size: 10.5px; }
  .gene { padding: 11px 12px; border: 1px solid var(--line); background: rgba(8, 14, 20, 0.5); }
  .gene .row { grid-template-columns: minmax(0, 1fr) 26px minmax(0, 1fr); }
  .gene .allele { grid-template-columns: minmax(0, 1fr); min-height: 0; padding: 8px 9px; }
  .gene .allele .fig { display: none; }
  .gene .stamp { font-size: 9.5px; letter-spacing: 0.1em; padding: 2px 6px; }
  .hint { margin: 0; font-size: 10.5px; line-height: 1.4; color: var(--faint); }
</style>
