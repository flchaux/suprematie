<script lang="ts">
  // Écran des recettes : celles que nos recherches ont débloquées, par machine, et le nombre restant à débloquer.
  // Une recette sélectionnée affiche en bas toute sa chaîne de production, depuis les minerais.
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
  const speedOf = (crafter: number) => d?.buildings.find((b) => b.key === MACHINES.find((m) => m.crafter === crafter)?.key)?.speed ?? 100;
  const machineName = (crafter: number) => MACHINES.find((m) => m.crafter === crafter)?.name ?? "Machine";
  const groups = $derived.by(() => {
    if (!d) return [];
    void ui.researchedLo;
    void ui.researchedHi;
    return MACHINES.map((m) => {
      const all = d.recipes.map((r, i) => ({ r, i })).filter(({ r }) => r.crafter === m.crafter);
      const open = all.filter(({ r }) => hasTechUI(r.tech));
      return { ...m, open, locked: all.length - open.length, speed: speedOf(m.crafter) };
    }).filter((g) => g.open.length || g.locked);
  });
  const total = $derived(groups.reduce((a, g) => a + g.open.length, 0));
  const locked = $derived(groups.reduce((a, g) => a + g.locked, 0));
  const key = $derived(keyOf("recipes"));
  /** objets par minute à la vitesse de la machine de base */
  const rate = (n: number, time: number, speed: number) => (n * 60 * 20 * speed) / 100 / Math.max(1, time);
  const perMin = (n: number, time: number, speed: number) => rate(n, time, speed).toFixed(1);
  /** Extracteur de niveau 1 à pleine énergie : un objet toutes les 30 ticks (voir tick_extractor), soit 40 par minute. */
  const EXTRACT_PER_MIN = 40;

  let sel = $state<number | null>(null);

  interface Step {
    item: number;
    /** objets par minute demandés par la chaîne */
    perMin: number;
    /** recette qui le fabrique (-1 : ressource brute, extraite) */
    recipe: number;
    /** machines de base nécessaires pour ce débit */
    machines: number;
    machine: string;
    locked: boolean;
    /** ingrédients par minute pour ce débit */
    inputs: [number, number][];
  }

  /**
   * Chaîne de production de la recette `ri` pour une machine de base à pleine vitesse : débit de chaque
   * objet intermédiaire et nombre de machines, en colonnes des ressources brutes (gauche) à la recette (droite).
   */
  const chain = $derived.by((): Step[][] => {
    if (!d || sel === null) return [];
    void ui.researchedLo;
    void ui.researchedHi;
    const data = d;
    const top = data.recipes[sel];
    // recette qui fabrique un objet : la recette choisie pour son produit, sinon une débloquée, sinon la première
    const recipeFor = (item: number): number => {
      if (top.output[0] === item) return sel as number;
      const all = data.recipes.map((r, i) => ({ r, i })).filter(({ r }) => r.output[0] === item);
      return (all.find(({ r }) => hasTechUI(r.tech)) ?? all[0])?.i ?? -1;
    };
    // niveau : plus long chemin depuis une ressource brute (0) ; un cycle est traité comme brut
    const depth = new Map<number, number>();
    const level = (item: number, stack: Set<number>): number => {
      const k = depth.get(item);
      if (k !== undefined) return k;
      const ri = recipeFor(item);
      if (ri < 0 || stack.has(item)) return 0;
      stack.add(item);
      const lv = 1 + Math.max(0, ...data.recipes[ri].inputs.map(([it]) => level(it, stack)));
      stack.delete(item);
      depth.set(item, lv);
      return lv;
    };
    const topLevel = level(top.output[0], new Set());
    // débits : du produit vers les ressources, par niveau décroissant (un objet est complet avant ses ingrédients)
    const want = new Map<number, number>([[top.output[0], rate(top.output[1], top.time, speedOf(top.crafter))]]);
    const items = () => [...want.keys()].sort((a, b) => (depth.get(b) ?? 0) - (depth.get(a) ?? 0));
    const done = new Set<number>();
    for (;;) {
      const it = items().find((x) => !done.has(x) && (depth.get(x) ?? 0) > 0);
      if (it === undefined) break;
      done.add(it);
      const r = data.recipes[recipeFor(it)];
      const cycles = (want.get(it) ?? 0) / r.output[1];
      for (const [inp, n] of r.inputs) want.set(inp, (want.get(inp) ?? 0) + cycles * n);
    }
    const cols: Step[][] = Array.from({ length: topLevel + 1 }, () => []);
    for (const [item, pm] of want) {
      const ri = (depth.get(item) ?? 0) > 0 ? recipeFor(item) : -1;
      if (ri < 0) {
        cols[0].push({ item, perMin: pm, recipe: -1, machines: pm / EXTRACT_PER_MIN, machine: "Extracteur", locked: false, inputs: [] });
        continue;
      }
      const r = data.recipes[ri];
      const one = rate(r.output[1], r.time, speedOf(r.crafter));
      const cycles = pm / r.output[1];
      cols[depth.get(item) ?? 0].push({
        item,
        perMin: pm,
        recipe: ri,
        machines: pm / one,
        machine: machineName(r.crafter),
        locked: !hasTechUI(r.tech),
        inputs: r.inputs.map(([inp, n]) => [inp, cycles * n]),
      });
    }
    for (const c of cols) c.sort((a, b) => a.item - b.item);
    return cols.filter((c) => c.length);
  });
  const fmt = (v: number) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)).replace(".", ",");
</script>

<div class="modal panel recipes">
  <button class="close ghost icon-btn" onclick={() => (ui.showRecipes = false)} title={key ? `Fermer (${key})` : "Fermer"}><Icon name="close" /></button>
  <div class="modal-head">
    <Icon name="recipe" size={26} />
    <div>
      <div class="kicker">Production</div>
      <h2>Recettes débloquées</h2>
    </div>
    <span class="dim count num">{total} recettes{#if locked} · {locked} à débloquer par la recherche{/if}</span>
  </div>
  <div class="list">
    {#if d}
      {#each groups as g (g.crafter)}
        <h3>{g.name}{#if g.locked}<span class="dim small"> · {g.locked} verrouillée{g.locked > 1 ? "s" : ""}</span>{/if}</h3>
        <div class="grid">
          {#each g.open as { r, i } (i)}
            <button class="card" class:sel={sel === i} onclick={() => (sel = sel === i ? null : i)} title="Afficher la chaîne de production depuis les minerais">
              <div class="flow">
                {#each r.inputs as [it, n]}<Item id={it} {n} />{/each}
                <span class="arrow">▸</span>
                <Item id={r.output[0]} n={r.output[1]} />
              </div>
              <div class="name">{d.items[r.output[0]].name}</div>
              <div class="dim small num">{(r.time / 20 / (g.speed / 100)).toFixed(1)} s · {perMin(r.output[1], r.time, g.speed)} /min</div>
            </button>
          {/each}
        </div>
      {/each}
    {/if}
  </div>
  {#if d && sel !== null && chain.length}
    {@const top = d.recipes[sel]}
    <div class="chain">
      <div class="chead">
        <span class="kicker">Chaîne de production</span>
        <b>{d.items[top.output[0]].name}</b>
        <span class="dim small">pour une {machineName(top.crafter).toLowerCase()} à pleine vitesse ({perMin(top.output[1], top.time, speedOf(top.crafter))} /min) · machines de base</span>
        <button class="ghost icon-btn" onclick={() => (sel = null)} title="Fermer la chaîne"><Icon name="close" size={14} /></button>
      </div>
      <div class="cols">
        {#each chain as col, k}
          {#if k > 0}<span class="sep">▸</span>{/if}
          <div class="col">
            {#each col as s (s.item)}
              <div class="step" class:raw={s.recipe < 0} class:final={s.item === top.output[0]}>
                <div class="srow"><Item id={s.item} size={22} /><span class="sname">{d.items[s.item].name}</span>{#if s.locked}<span class="lk" title="Recette à débloquer par la recherche"><Icon name="lock" size={11} /></span>{/if}</div>
                <div class="num small"><b>{fmt(s.perMin)}</b> /min</div>
                <div class="dim small num">{fmt(s.machines)} × {s.machine}</div>
                {#if s.inputs.length}
                  <div class="ins">{#each s.inputs as [it, n]}<span class="in"><Item id={it} size={14} /><span class="num">{fmt(n)}</span></span>{/each}</div>
                {/if}
              </div>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .recipes { display: flex; flex-direction: column; overflow: hidden; }
  .list { flex: 1; min-height: 0; overflow: auto; }
  .count { margin-left: auto; font-size: 12px; }
  h3 { margin: 14px 0 8px; font-size: 13px; color: var(--accent); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
  .card { display: block; width: 100%; text-align: left; font: inherit; color: inherit; cursor: pointer; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; background: rgba(255, 255, 255, 0.02); transition: border-color 0.1s, background 0.1s; }
  .card:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); background: rgba(62, 240, 255, 0.04); }
  .card.sel { border-color: var(--accent); background: rgba(62, 240, 255, 0.08); box-shadow: 0 0 0 1px var(--accent) inset; }
  .flow { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .arrow { color: var(--accent); }
  .name { margin-top: 4px; font-weight: 600; font-size: 12.5px; }
  .small { font-size: 11px; }
  .chain { flex: none; max-height: 45%; display: flex; flex-direction: column; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--line); }
  .chead { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; }
  .chead button { margin-left: auto; }
  .cols { display: flex; align-items: flex-start; gap: 8px; overflow: auto; padding-bottom: 6px; }
  .col { display: flex; flex-direction: column; gap: 6px; flex: none; }
  .sep { align-self: center; color: var(--accent); font-size: 18px; flex: none; }
  .step { width: 168px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: rgba(255, 255, 255, 0.02); }
  .step.raw { border-style: dashed; }
  .step.final { border-color: var(--accent); }
  .srow { display: flex; align-items: center; gap: 6px; }
  .sname { font-weight: 600; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lk { color: var(--warn); }
  .ins { display: flex; flex-wrap: wrap; gap: 4px 8px; margin-top: 4px; font-size: 10.5px; }
  .in { display: inline-flex; align-items: center; gap: 2px; }
</style>
