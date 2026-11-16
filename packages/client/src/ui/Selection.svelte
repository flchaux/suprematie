<script lang="ts">
  import { ui, hasTechUI } from "../game/state.svelte.ts";
  import { client } from "../game/client.ts";
  import { BClass, Layer, RECIPE_NONE, PACK1 } from "@supreme/shared";
  import Item from "./Item.svelte";
  import Cost from "./Cost.svelte";

  const d = $derived(ui.data);
  const sb = $derived(ui.selBuilding);
  const bdef = $derived(sb && d ? d.buildings[sb.kind] : null);
  const info = $derived(ui.buildingInfo as Record<string, any> | null);
  const mine = $derived(!!sb && sb.owner === ui.me);
  const kinds = $derived(ui.selUnits.map((g) => g.kind));
  const has = (key: string) => !!d && kinds.some((k) => d.units[k].key === key);
  const anyCarrier = $derived(!!d && kinds.some((k) => d.units[k].carry > 0));
  const anyEng = $derived(!!d && kinds.some((k) => d.units[k].buildPower > 0));
  const deployable = $derived(has("sonde") || has("heavy_artillery"));
  const factoryUnits = $derived(bdef && d && bdef.cls === BClass.Factory ? d.units.map((u, i) => ({ u, i })).filter(({ u }) => u.factory === bdef.factory) : []);
  const recipes = $derived(bdef && d && bdef.cls === BClass.Crafter ? d.recipes.map((r, i) => ({ r, i })).filter(({ r }) => r.crafter === bdef.crafter) : []);
  const total = $derived(ui.selUnits.reduce((s, g) => s + g.count, 0));
  const abbrev = (n: string) => n.split(/[\s-]/).map((w) => w[0]).join("").slice(0, 3).toUpperCase();
  const status = $derived.by(() => {
    if (!info) return "";
    if (info.build < 65536) return `En construction ${Math.floor((info.build / 65536) * 100)} %` + (info.stalled ? " (stock insuffisant)" : "");
    if (bdef && (bdef.powerUse > 0) && (!info.net || info.sat < 512)) return "Hors réseau électrique ou sous-alimenté";
    return info.working ? "En marche" : "En attente";
  });
</script>

{#if sb && bdef && d}
  <div class="panel sel">
    <div class="head">
      <b>{bdef.name}</b>
      <span class="dim">{ui.names[sb.owner] ?? ""}</span>
      {#if info}<span class="dim">PV {info.hp}/{bdef.hp}</span>{/if}
    </div>
    <div class:warn={status.startsWith("Hors") || status.includes("insuffisant")} class="dim">{status}</div>
    {#if mine && info}
      {#if info.build < 65536}
        <button onclick={() => client.cancelBuilding()}>Annuler le chantier (Suppr)</button>
      {/if}
      {#if bdef.cls === BClass.Crafter}
        <div class="row">
          <span>Recette :</span>
          <select value={info.recipe} onchange={(e) => client.setRecipe(Number((e.target as HTMLSelectElement).value))}>
            <option value={RECIPE_NONE}>{bdef.crafter === 1 ? "— choisir —" : "automatique"}</option>
            {#each recipes as { r, i }}
              <option value={i} disabled={!hasTechUI(r.tech)}>{d.items[r.output[0]].name}</option>
            {/each}
          </select>
        </div>
        {#if info.recipe !== RECIPE_NONE && d.recipes[info.recipe]}
          {@const r = d.recipes[info.recipe]}
          <div class="row">
            {#each r.inputs as [it, n], j}<span class="tip"><Item id={it} n={info.inv[j]} need={n} /><span class="tt">{d.items[it].name} : {info.inv[j]} (recette : {n})</span></span>{/each}
            → <span class="tip"><Item id={r.output[0]} n={info.out} /><span class="tt">{d.items[r.output[0]].name} ×{r.output[1]} en {(r.time / 20 / (bdef.speed / 100)).toFixed(1)} s</span></span>
          </div>
        {/if}
      {:else if bdef.cls === BClass.Factory}
        <div class="units">
          {#each factoryUnits as { u, i }}
            {@const ok = hasTechUI(u.tech)}
            <div class="tip">
              <button class="ub" disabled={!ok} onclick={(e) => client.queueUnit(i, e.shiftKey ? 5 : 1)} oncontextmenu={(e) => { e.preventDefault(); client.queueUnit(i, e.shiftKey ? -5 : -1); }}>
                {u.name}
              </button>
              <div class="tt"><b>{u.name}</b><br />{#if !ok}<span class="bad">Recherche : {d.techs[u.tech].name}</span><br />{/if}
                PV {u.hp} · vitesse {(u.speed / 10).toFixed(1)} c/s · {u.build} s<br /><Cost cost={u.cost} />
                <span class="dim">Clic : +1, Maj+clic : +5, clic droit : retirer. Les composants arrivent par bras.</span></div>
            </div>
          {/each}
        </div>
        <div class="row">
          <label><input type="checkbox" checked={info.repeat} onchange={(e) => client.toggleRepeat((e.target as HTMLInputElement).checked)} /> Répéter</label>
          <span class="dim">File :</span>
          {#each info.queue as [k, n]}<span>{d.units[k].name} ×{n}</span>{:else}<span class="dim">vide</span>{/each}
        </div>
        {#if info.queue.length}
          {@const cur = d.units[info.queue[0][0]]}
          <div class="row"><span class="dim">Composants :</span>{#each cur.cost as [it, n], j}<Item id={it} n={info.inv[j]} need={n} />{/each}</div>
        {/if}
        <span class="dim small">Clic droit sur le terrain : point de ralliement.</span>
      {:else if bdef.cls === BClass.Lab}
        <div class="row">Recherche : {ui.research ? d.techs[ui.research].name : "aucune"} <button onclick={() => (ui.showResearch = true)}>Choisir (T)</button></div>
        <div class="row">{#each [0, 1, 2, 3, 4, 5] as k}<Item id={PACK1 + k} n={info.inv[k]} />{/each}</div>
      {:else if bdef.cls === BClass.Silo}
        <div class="row">Missiles prêts : {info.ammo} <button disabled={!info.ammo} onclick={() => client.setMode("launch")}>Lancer</button></div>
        <div class="row"><span class="dim">Composants :</span>{#each d.missileCost as [it, n], j}<Item id={it} n={info.inv[j]} need={n} />{/each}</div>
      {:else if bdef.cls === BClass.AntiMissile}
        <div class="row">Intercepteurs : {info.ammo}/3</div>
        <div class="row"><span class="dim">Composants :</span>{#each d.interceptorCost as [it, n], j}<Item id={it} n={info.inv[j]} need={n} />{/each}</div>
      {:else if bdef.cls === BClass.Orbital}
        <div class="row">Charge : {Math.floor((info.charge / (60 * 20 * 1024)) * 100)} % <button disabled={info.charge < 60 * 20 * 1024} onclick={() => client.setMode("fire")}>Tirer</button></div>
      {:else if bdef.cls === BClass.Transfer}
        <div class="row"><button disabled={info.cooldown > 0} onclick={() => client.setMode("transfer")}>Transférer les unités proches</button>{#if info.cooldown > 0}<span class="dim">{Math.ceil(info.cooldown / 20)} s</span>{/if}</div>
      {:else if bdef.cls === BClass.Gate}
        <div class="row"><button onclick={() => client.setMode("link")}>Relier à une autre porte</button><button onclick={() => client.toggleBuilding()}>{info.enabled ? "Fermer" : "Ouvrir"}</button></div>
        <span class="dim small">{info.link >= 0 ? (info.working ? "Ouverte" : "Ouverture… (forte consommation)") : "Non reliée"}</span>
      {:else if bdef.cls === BClass.Shield}
        <div class="row">Bouclier : {info.shield} <button onclick={() => client.toggleBuilding()}>{info.enabled ? "Couper" : "Activer"}</button></div>
      {:else if bdef.cls === BClass.Extractor}
        <div class="row">Extrait : <Item id={info.recipe} /> {d.items[info.recipe]?.name}</div>
      {:else if bdef.cls === BClass.Depot}
        <span class="dim">Tout ce qui entre ici rejoint le stock commun utilisé par les ingénieurs.</span>
      {/if}
    {/if}
  </div>
{:else if ui.selUnits.length && d}
  <div class="panel sel">
    <div class="head"><b>{total} unité{total > 1 ? "s" : ""}</b></div>
    <div class="groups">
      {#each ui.selUnits as g}
        <button class="grp tip" onclick={() => client.selectIds(g.ids)} title={d.units[g.kind].name}>
          <span class="ab">{abbrev(d.units[g.kind].name)}</span><span class="cnt">{g.count}</span>
          <span class="tt"><b>{d.units[g.kind].name}</b><br />PV {d.units[g.kind].hp} · {client.unitLayerName(d.units[g.kind].layer)}</span>
        </button>
      {/each}
    </div>
    {#if ui.selUnits.length === 1}<div class="dim">{d.units[ui.selUnits[0].kind].name}</div>{/if}
    {#if ui.me >= 0 && ui.selUnits.every((g) => true)}
      <div class="cmds">
        <button onclick={() => client.stopSelected()}>Arrêt (X)</button>
        <button onclick={() => client.setMode("attackMove")}>Attaque (A)</button>
        <button onclick={() => client.setMode("patrol")}>Patrouille (P)</button>
        <button onclick={() => client.setMode("assist")}>Escorter (G)</button>
        <button onclick={() => client.setMode("attackGround")}>Tir au sol</button>
        {#if anyEng}<button onclick={() => client.setMode("reclaim")}>Recycler (E)</button>{/if}
        {#if deployable}<button onclick={() => client.deploySelected()}>Déployer (F)</button>{/if}
        {#if anyCarrier}<button onclick={() => client.setMode("unload")}>Décharger (U)</button>{/if}
        {#if has("commander") && hasTechUI(35)}<button onclick={() => client.setMode("teleport")}>Téléportation</button>{/if}
        {#if has("hyper_cruiser")}<button onclick={() => client.setMode("jump")}>Saut hyperespace</button>{/if}
      </div>
    {/if}
    {#if anyEng}<span class="dim small">Choisissez un bâtiment à droite. Clic droit sur une épave : recycler.</span>{/if}
  </div>
{/if}

<style>
  .sel { padding: 7px 9px; min-width: 260px; max-width: 520px; display: flex; flex-direction: column; gap: 5px; max-height: 240px; overflow: auto; }
  .head { display: flex; gap: 8px; align-items: baseline; }
  .row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .units { display: flex; flex-wrap: wrap; gap: 3px; }
  .ub { font-size: 11px; padding: 3px 6px; }
  .groups { display: flex; flex-wrap: wrap; gap: 3px; }
  .grp { display: flex; flex-direction: column; align-items: center; width: 44px; padding: 3px; }
  .ab { font-weight: bold; font-size: 12px; }
  .cnt { font-size: 11px; color: var(--dim); }
  .cmds { display: flex; flex-wrap: wrap; gap: 3px; }
  .cmds button { font-size: 12px; padding: 3px 6px; }
  .small { font-size: 11px; }
</style>
