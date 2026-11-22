<script lang="ts">
  import { ui, hasTechUI } from "../game/state.svelte.ts";
  import { client } from "../game/client.ts";
  import Cost from "./Cost.svelte";
  import Icon from "./Icon.svelte";
  import { sprite } from "./sprites.ts";
  import { buildCats } from "../game/catalog.ts";
  import { kb, keyOf } from "../game/keys.svelte.ts";
  import { plans } from "../game/plans.svelte.ts";
  import { BUILDING_DESCS } from "../game/buildingDescs.ts";

  // catégories de la race du joueur ; catégorie affichée : partagée avec le menu au clavier (B, puis chiffre, puis chiffre)
  const CATS = $derived(buildCats(ui.race));
  const cat = $derived(Math.min(kb.buildCat, Math.max(0, CATS.length - 1)));
  const idx = $derived(ui.data ? Object.fromEntries(ui.data.buildings.map((b, i) => [b.key, i])) : {});
  const short = (n: string) => n.replace("Tourelle ", "T. ").replace("Générateur de bouclier", "Bouclier").replace("Centrale à hydrocarbure", "Centrale").replace("Silo de missile stratégique", "Silo stratégique").replace("Plateforme de transfert", "Transfert").replace("Défense antimissile", "Antimissile").replace("Balise d'hyperespace", "Balise").replace("Portique expérimental", "Portique");
  const bKey = $derived(keyOf("buildMenu"));
  // lieu du disponible qui colore le coût (voir client.queryBuildReach)
  const REACH_AT = { cursor: "En rouge : ce qui manque à portée de l'emplacement visé", builder: "En rouge : ce qui manque à portée du constructeur choisi", view: "En rouge : ce qui manque à portée du centre de l'écran" };
</script>

<div class="panel build">
  <div class="tabs" class:armed={kb.buildStep === "cat"}>
    {#each CATS as [name, icon], i}
      <button class="tab" class:on={cat === i} onclick={() => (kb.buildCat = i)} title={name}><span class="kn num">{i + 1}</span><Icon name={icon} size={15} /><span class="tn">{name}</span></button>
    {/each}
    <span class="hint">
      {#if kb.buildStep === "cat"}<span class="ask">Catégorie ? <span class="key">1–{CATS.length}</span> <span class="key">Échap</span></span>
      {:else if kb.buildStep === "item"}<span class="ask">Bâtiment ? <span class="key">1–{CATS[cat]?.[2].length ?? 0}</span> <span class="key">Échap</span></span>
      {:else if bKey}<span class="key" title="Menu de construction au clavier : {bKey}, puis le numéro de la catégorie, puis celui du bâtiment">{bKey}</span>{/if}
    </span>
    <span class="plan-btns">
      <button class="tab" class:on={ui.mode === "copy"} onclick={() => client.plans.startCopy()} title="Copier une zone de vos bâtiments (glisser un cadre){keyOf('copyPlan') ? ` : ${keyOf('copyPlan')}` : ''}"><Icon name="copy" size={15} /></button>
      <button class="tab" class:on={ui.mode === "paste"} disabled={!plans.active} onclick={() => client.plans.startPaste()} title="Coller le plan actif{keyOf('pastePlan') ? ` : ${keyOf('pastePlan')}` : ''}"><Icon name="paste" size={15} /></button>
      <button class="tab" class:on={plans.show} onclick={() => (plans.show = !plans.show)} title="Bibliothèque de plans{keyOf('planLibrary') ? ` : ${keyOf('planLibrary')}` : ''}"><Icon name="blueprint" size={15} /><span class="num pc">{plans.list.length}</span></button>
    </span>
  </div>
  <div class="grid" class:armed={kb.buildStep === "item"}>
    {#if CATS.length === 0}
      <p class="nomad">Les Transhumants ne construisent pas : sélectionnez un chenillard et déployez-le (bouton « Déployer » ou touche de déploiement) pour qu'il devienne son module ; repliez un module depuis sa fiche pour repartir.</p>
    {/if}
    {#each CATS[cat]?.[2] ?? [] as key, n}
      {@const i = idx[key]}
      {@const b = ui.data?.buildings[i]}
      {#if b}
        <!-- socle à EPPZ : il faut un EPPZ capturé en réserve -->
        {@const ok = hasTechUI(b.tech) && (key !== "eppz_socket" || ui.eppz > 0)}
        {@const src = sprite("buildings", key)}
        <div class="tip">
          <button class="card" class:on={ui.buildKind === i && ui.mode === "build"} class:locked={!ok} disabled={!ok} onclick={() => client.startBuild(i)}>
            {#if src}<img {src} alt="" />{:else}<span class="ph"><Icon name={CATS[cat]?.[1] ?? "production"} size={26} /></span>{/if}
            <span class="kn num">{n + 1}</span>
            <span class="name">{short(b.name)}</span>
            <span class="sz num">{b.w}×{b.h}</span>
            {#if !ok}<span class="lock"><Icon name="lock" size={14} /></span>{/if}
          </button>
          <div class="tt">
            <b>{b.name}</b> <span class="dim num">{b.w}×{b.h}</span><br />
            {#if BUILDING_DESCS[key]}<span class="bdesc">{BUILDING_DESCS[key]}</span><br />{/if}
            {#if !ok}<span class="bad"><Icon name="lock" size={12} /> Recherche requise : {ui.data?.techs[b.tech].name}</span><br />{/if}
            <Cost cost={b.cost} have={ui.race === 0 ? ui.buildReach : undefined} />
            {#if ui.race === 0 && b.cost.length}<span class="reach dim">{REACH_AT[ui.buildReachAt]}</span><br />{/if}
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
  .tab { position: relative; }
  .tab:not(.on) .tn { display: none; }
  /* au survol, le nom s'affiche en bulle au-dessus de l'onglet, sans décaler la barre */
  .tab:not(.on):hover .tn { display: block; position: absolute; bottom: calc(100% + 5px); left: 50%; transform: translateX(-50%); white-space: nowrap; padding: 3px 8px; background: var(--bg, #0b1219); border: 1px solid var(--line-hi, #2a4a5a); color: var(--text); font-size: 11px; pointer-events: none; z-index: 30; }
  .hint { margin-left: auto; padding-right: 4px; white-space: nowrap; }
  .plan-btns { display: inline-flex; gap: 3px; padding-left: 6px; border-left: 1px solid var(--line); }
  .pc { font-size: 9.5px; color: var(--dim); }
  .ask { color: var(--amber); font-size: 11.5px; letter-spacing: 0.06em; }
  .kn { font-size: 9.5px; color: var(--dim); line-height: 1; }
  .tab.on .kn { color: inherit; opacity: 0.8; }
  .card .kn { position: absolute; top: 4px; left: 5px; }
  .armed .kn, .armed .tab.on .kn { color: var(--accent-ink); opacity: 1; background: var(--amber); padding: 1px 3px; font-weight: 600; box-shadow: 0 0 6px rgba(255, 181, 71, 0.6); }
  .grid { display: grid; grid-template-columns: repeat(5, 106px); gap: 5px; }
  .card { position: relative; width: 106px; height: 86px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 1px; padding: 4px 4px 5px; overflow: hidden; }
  .card img { position: absolute; top: 3px; left: 50%; transform: translateX(-50%); width: 58px; height: 58px; object-fit: contain; filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.6)); transition: transform 0.15s; }
  .card:hover:not(:disabled) img { transform: translateX(-50%) scale(1.08) translateY(-2px); }
  .ph { position: absolute; top: 14px; color: var(--accent); opacity: 0.6; }
  .name { position: relative; font-size: 11px; line-height: 1.1; text-align: center; letter-spacing: 0.02em; }
  .sz { position: absolute; top: 3px; right: 5px; font-size: 9.5px; color: var(--dim); }
  .lock { position: absolute; top: 18px; left: 5px; color: var(--amber); }
  .card.locked img { filter: grayscale(1) brightness(0.55); }
  .card:disabled { opacity: 0.62; }
  /* écrans étroits : le panneau rétrécit, les onglets passent à la ligne, la grille perd des colonnes */
  /* taille fixe : la largeur ne dépend pas de la catégorie, la grille défile au-delà de deux rangées */
  .build { min-width: 0; flex-shrink: 0; width: min(600px, calc(100vw - 545px)); max-width: none; }
  .tabs { flex-wrap: wrap; }
  .grid { grid-template-columns: repeat(auto-fill, 106px); height: 182px; overflow-y: auto; align-content: start; padding-right: 2px; scrollbar-width: thin; }
  @media (max-width: 1250px) {
    .grid { grid-template-columns: repeat(auto-fill, 92px); }
    .card { width: 92px; height: 78px; } .grid { height: 166px; }
    .card img { width: 48px; height: 48px; }
  }
  .nomad { grid-column: 1 / -1; margin: 6px 4px; line-height: 1.45; color: var(--dim); font-size: 12px; }
  .reach { font-size: 11px; }
  .bdesc { display: block; margin: 3px 0; line-height: 1.4; max-width: 340px; color: color-mix(in srgb, var(--text) 82%, transparent); }
</style>
