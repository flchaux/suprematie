<script lang="ts">
  import { ui, hasTechUI } from "../game/state.svelte.ts";
  import { client } from "../game/client.ts";
  import { BClass, RECIPE_NONE, PACK1 } from "@supreme/shared";
  import Item from "./Item.svelte";
  import Cost from "./Cost.svelte";
  import Icon from "./Icon.svelte";
  import { sprite } from "./sprites.ts";
  import { PLAYER_COLORS } from "../models/generator.ts";

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
  // diagnostic : ce qui bloque le bâtiment, en clair
  const status = $derived.by(() => {
    if (!info || !bdef || !d) return { text: "", kind: "" };
    if (info.build < 65536) return { text: `En construction ${Math.floor((info.build / 65536) * 100)} %` + (info.stalled ? " · stock insuffisant" : ""), kind: info.stalled ? "warn" : "build" };
    if (bdef.powerUse > 0 && !info.net) return { text: "Hors réseau électrique : reliez-le à un générateur (pylônes)", kind: "warn" };
    if (bdef.powerUse > 0 && info.sat < 512) return { text: `Sous-alimenté (${Math.round((info.sat / 1024) * 100)} %) : il manque des générateurs`, kind: "warn" };
    if (bdef.cls === BClass.Crafter && info.recipe !== RECIPE_NONE && !info.working) {
      const r = d.recipes[info.recipe];
      if (info.out + r.output[1] > Math.max(4, r.output[1] * 3)) return { text: `Sortie bloquée : ${d.items[r.output[0]].name} n'est pas emporté (bras ou tapis de sortie)`, kind: "warn" };
      const miss = r.inputs.filter(([, n], j) => info.inv[j] < n).map(([it]) => d.items[it].name);
      if (miss.length) return { text: `En attente de : ${miss.join(", ")}`, kind: "warn" };
    }
    if (bdef.cls === BClass.Extractor && info.out >= 5) return { text: "Sortie bloquée : le minerai n'est pas emporté", kind: "warn" };
    if (bdef.cls === BClass.Factory && info.queue.length && !info.working) {
      const u = d.units[info.queue[0][0]];
      const miss = u.cost.filter(([, n], j) => info.inv[j] < n).map(([it]) => d.items[it].name);
      if (miss.length) return { text: `En attente de composants : ${miss.join(", ")} (par bras)`, kind: "warn" };
    }
    if (bdef.cls === BClass.Lab && !info.working && ui.research) return { text: "En attente de lots de recherche", kind: "warn" };
    const low = bdef.powerUse > 0 && info.sat < 900 ? ` · énergie ${Math.round((info.sat / 1024) * 100)} %` : "";
    return info.working ? { text: "En marche" + low, kind: low ? "warn" : "good" } : { text: "En attente" + low, kind: "idle" };
  });
  /** Débit d'un fabricant : objets par minute à pleine vitesse, et au niveau d'énergie actuel. */
  const rate = $derived.by(() => {
    if (!info || !bdef || !d || bdef.cls !== BClass.Crafter || info.recipe === RECIPE_NONE) return null;
    const r = d.recipes[info.recipe];
    const ticks = (r.time * 100) / Math.max(1, bdef.speed);
    const max = (1200 / ticks) * r.output[1];
    return { max, now: info.working ? max * Math.min(1, (info.sat ?? 1024) / 1024) : 0, item: r.output[0] };
  });
  const STATE = ["à quai", "en route vers la destination", "à quai à destination", "en retour"];
  const isStation = $derived(!!bdef && (bdef.cls === BClass.Station || bdef.cls === BClass.CargoPad));
  const NI = $derived(d?.items.length ?? 27);
  const stashList = (recv: boolean) => (info?.stash?.length ? (info.stash as number[]).slice(recv ? NI : 0, recv ? 2 * NI : NI).map((n, i) => ({ i, n })).filter((x) => x.i > 0 && x.n > 0) : []);
  const hpf = $derived(info && bdef ? info.hp / bdef.hp : 1);
  const owner = $derived(sb ? "#" + PLAYER_COLORS[sb.owner % 8].toString(16).padStart(6, "0") : "");
</script>

{#if sb && bdef && d}
  <div class="panel sel">
    <div class="head" style:--pc={owner}>
      <div class="thumb">{#if sprite("buildings", bdef.key)}<img src={sprite("buildings", bdef.key)} alt="" />{/if}</div>
      <div class="ht">
        <div class="kicker">{ui.names[sb.owner] ?? ""}</div>
        <b class="title">{bdef.name}</b>
        {#if info}
          <div class="hpline"><span class="hp" class:mid={hpf < 0.6} class:low={hpf < 0.3}><span style:width={hpf * 100 + "%"}></span></span><span class="num small">{info.hp}/{bdef.hp}</span></div>
        {/if}
      </div>
    </div>
    {#if status.text}<div class="status {status.kind}"><span class="led"></span>{status.text}</div>{/if}
    {#if mine && info}
      {#if info.build < 65536}
        <button class="icon-btn danger" onclick={() => client.cancelBuilding()}><Icon name="close" size={14} /> Annuler le chantier <span class="key">Suppr</span></button>
      {/if}
      {#if rate}
        <div class="row small"><span class="kicker">Débit</span> <Item id={rate.item} size={16} /> <span class="num">{rate.now.toFixed(1)}</span>/min <span class="dim">(max <span class="num">{rate.max.toFixed(1)}</span>)</span></div>
      {/if}
      {#if bdef.cls === BClass.Crafter}
        <div class="row">
          <span class="kicker">Recette</span>
          <select value={info.recipe} onchange={(e) => client.setRecipe(Number((e.target as HTMLSelectElement).value))}>
            <option value={RECIPE_NONE}>{bdef.crafter === 1 ? "— choisir —" : "automatique"}</option>
            {#each recipes as { r, i }}
              <option value={i} disabled={!hasTechUI(r.tech)}>{d.items[r.output[0]].name}</option>
            {/each}
          </select>
        </div>
        {#if info.recipe !== RECIPE_NONE && d.recipes[info.recipe]}
          {@const r = d.recipes[info.recipe]}
          <div class="flow">
            {#each r.inputs as [it, n], j}<span class="tip slot"><Item id={it} n={info.inv[j]} need={n} size={22} /><span class="tt">{d.items[it].name} : {info.inv[j]} (recette : {n})</span></span>{/each}
            <span class="arrow">▸▸</span>
            <span class="tip slot out"><Item id={r.output[0]} n={info.out} size={26} /><span class="tt">{d.items[r.output[0]].name} ×{r.output[1]} en {(r.time / 20 / (bdef.speed / 100)).toFixed(1)} s</span></span>
          </div>
        {/if}
      {:else if bdef.cls === BClass.Factory}
        <div class="units">
          {#each factoryUnits as { u, i }}
            {@const ok = hasTechUI(u.tech)}
            {@const q = info.queue.find((e: [number, number]) => e[0] === i)}
            <div class="tip">
              <button class="ub" class:locked={!ok} disabled={!ok} onclick={(e) => client.queueUnit(i, e.shiftKey ? 5 : 1)} oncontextmenu={(e) => { e.preventDefault(); client.queueUnit(i, e.shiftKey ? -5 : -1); }}>
                {#if sprite("units", u.key)}<img src={sprite("units", u.key)} alt="" />{:else}<span class="ab">{abbrev(u.name)}</span>{/if}
                {#if q}<span class="qn num">{q[1]}</span>{/if}
                {#if !ok}<span class="lk"><Icon name="lock" size={12} /></span>{/if}
              </button>
              <div class="tt"><b>{u.name}</b><br />{#if !ok}<span class="bad"><Icon name="lock" size={12} /> Recherche : {d.techs[u.tech].name}</span><br />{/if}
                <span class="num">PV {u.hp} · {(u.speed / 10).toFixed(1)} c/s · {u.build} s</span><br /><Cost cost={u.cost} />
                <span class="dim">Clic : +1 · Maj+clic : +5 · clic droit : retirer. Les composants arrivent par bras.</span></div>
            </div>
          {/each}
        </div>
        <div class="row">
          <label class="rep"><input type="checkbox" checked={info.repeat} onchange={(e) => client.toggleRepeat((e.target as HTMLInputElement).checked)} /> <Icon name="repeat" size={14} /> Répéter</label>
          {#if !info.queue.length}<span class="dim small">File vide</span>{/if}
        </div>
        {#if info.queue.length}
          {@const cur = d.units[info.queue[0][0]]}
          <div class="row"><span class="kicker">En cours · {cur.name}</span>{#each cur.cost as [it, n], j}<Item id={it} n={info.inv[j]} need={n} size={16} />{/each}</div>
        {/if}
        <span class="dim small"><Icon name="rally" size={12} /> Clic droit sur le terrain : point de ralliement.</span>
      {:else if bdef.cls === BClass.Lab}
        <div class="row"><span class="kicker">Recherche</span> {ui.research ? d.techs[ui.research].name : "aucune"} <button class="icon-btn" onclick={() => (ui.showResearch = true)}><Icon name="research" size={14} /> Choisir <span class="key">T</span></button></div>
        <div class="row">{#each [0, 1, 2, 3, 4, 5] as k}<Item id={PACK1 + k} n={info.inv[k]} size={20} />{/each}</div>
      {:else if bdef.cls === BClass.Silo}
        <div class="row">Missiles prêts : <b class="num">{info.ammo}</b> <button class="icon-btn primary" disabled={!info.ammo} onclick={() => client.setMode("launch")}><Icon name="target" size={14} /> Lancer</button></div>
        <div class="row"><span class="kicker">Composants</span>{#each d.missileCost as [it, n], j}<Item id={it} n={info.inv[j]} need={n} size={16} />{/each}</div>
      {:else if bdef.cls === BClass.AntiMissile}
        <div class="row">Intercepteurs : <b class="num">{info.ammo}/3</b></div>
        <div class="row"><span class="kicker">Composants</span>{#each d.interceptorCost as [it, n], j}<Item id={it} n={info.inv[j]} need={n} size={16} />{/each}</div>
      {:else if bdef.cls === BClass.Orbital}
        <div class="row">Charge : <b class="num">{Math.floor((info.charge / (60 * 20 * 1024)) * 100)} %</b> <button class="icon-btn primary" disabled={info.charge < 60 * 20 * 1024} onclick={() => client.setMode("fire")}><Icon name="target" size={14} /> Tirer</button></div>
      {:else if bdef.cls === BClass.Transfer}
        <div class="row"><button class="icon-btn" disabled={info.cooldown > 0} onclick={() => client.setMode("transfer")}><Icon name="teleport" size={14} /> Transférer les unités proches</button>{#if info.cooldown > 0}<span class="dim num">{Math.ceil(info.cooldown / 20)} s</span>{/if}</div>
      {:else if bdef.cls === BClass.Gate}
        <div class="row"><button class="icon-btn" onclick={() => client.setMode("link")}><Icon name="link" size={14} /> Relier à une autre porte</button><button onclick={() => client.toggleBuilding()}>{info.enabled ? "Fermer" : "Ouvrir"}</button></div>
        <span class="dim small">{info.link >= 0 ? (info.working ? "Ouverte" : "Ouverture… (forte consommation)") : "Non reliée"}</span>
      {:else if bdef.cls === BClass.Shield}
        <div class="row">Bouclier : <b class="num">{info.shield}</b> <button onclick={() => client.toggleBuilding()}>{info.enabled ? "Couper" : "Activer"}</button></div>
      {:else if bdef.cls === BClass.Extractor}
        <div class="row"><span class="kicker">Extrait</span> <Item id={info.recipe} size={20} /> {d.items[info.recipe]?.name}</div>
      {:else if bdef.cls === BClass.Depot}
        <span class="dim">Tout ce qui entre ici rejoint votre stock personnel, utilisé par vos ingénieurs.</span>
      {:else if bdef.cls === BClass.Warehouse}
        <span class="dim small">Ce qui entre ici rejoint le stock de l'équipe : chaque allié peut s'en servir pour construire (après son propre stock).</span>
        <div class="row"><span class="kicker">Sortie</span>
          <select value={info.recipe === 255 ? 0 : info.recipe} title="Objet qu'un bras peut prendre dans l'entrepôt" onchange={(e) => client.setRecipe(Number((e.target as HTMLSelectElement).value) || RECIPE_NONE)}>
            <option value={0}>— aucune —</option>
            {#each d.items as it, i}{#if i > 0}<option value={i}>{it.name} ({ui.teamStock[i] ?? 0})</option>{/if}{/each}
          </select></div>
        <div class="row wrap">{#each ui.teamStock as n, i}{#if i > 0 && n > 0}<Item id={i} {n} size={18} />{/if}{/each}</div>
      {:else if isStation}
        {@const air = bdef.cls === BClass.CargoPad}
        <span class="dim small">{air ? "Drones : vol direct, rapides, 25 objets par voyage." : "Trains : sur les rails de l'équipe, 400 objets par voyage."} Les bras déposent dans « À envoyer » et prennent dans « Reçus ». Une gare alliée peut être la destination.</span>
        <div class="row wrap"><span class="kicker">À envoyer</span>{#each stashList(false) as x}<Item id={x.i} n={x.n} size={16} />{:else}<span class="dim small">vide</span>{/each}</div>
        <div class="row wrap"><span class="kicker">Reçus</span>{#each stashList(true) as x}<Item id={x.i} n={x.n} size={16} />{:else}<span class="dim small">vide</span>{/each}</div>
        <div class="row wrap"><span class="kicker">{air ? "Drones" : "Trains"}</span>
          {#each info.carriers ?? [] as c}<span class="chip small" title={ui.names[c.owner] ?? ""}>{c.out ? "→" : "←"} {STATE[c.state] ?? ""} · <span class="num">{c.load}</span></span>{:else}<span class="dim small">aucun</span>{/each}</div>
        <div class="row">
          <button class="icon-btn" onclick={() => client.setMode("link")}><Icon name="link" size={14} /> {air ? "Ajouter un drone vers…" : "Ajouter un train vers…"}</button>
          {#if (info.carriers ?? []).some((c: { out: number }) => c.out)}<button class="ghost danger icon-btn" title="Retirer les véhicules partant d'ici" onclick={() => client.removeCarriers()}><Icon name="trash" size={14} /></button>{/if}
        </div>
        {#if d.carriers?.[air ? 1 : 0]}<span class="dim small">Coût d'un {air ? "drone" : "train"} : <Cost cost={d.carriers[air ? 1 : 0].cost} /></span>{/if}
      {/if}
    {/if}
  </div>
{:else if ui.selUnits.length && d}
  <div class="panel sel">
    <div class="uhead">
      <span class="kicker">Sélection</span>
      <b class="title num">{total}</b>
      <span class="dim">unité{total > 1 ? "s" : ""}{#if ui.selUnits.length === 1} · {d.units[ui.selUnits[0].kind].name}{/if}</span>
    </div>
    <div class="groups">
      {#each ui.selUnits as g}
        <button class="grp tip" onclick={() => client.selectIds(g.ids)}>
          {#if sprite("units", d.units[g.kind].key)}<img src={sprite("units", d.units[g.kind].key)} alt="" />{:else}<span class="ab">{abbrev(d.units[g.kind].name)}</span>{/if}
          <span class="cnt num">{g.count}</span>
          <span class="tt"><b>{d.units[g.kind].name}</b><br /><span class="num">PV {d.units[g.kind].hp}</span> · {client.unitLayerName(d.units[g.kind].layer)}<br /><span class="dim">Clic : ne garder que ce type</span></span>
        </button>
      {/each}
    </div>
    {#if ui.me >= 0}
      <div class="cmds">
        <button class="cmd" onclick={() => client.stopSelected()} title="Arrêt"><Icon name="stop" size={17} /><span class="key">X</span></button>
        <button class="cmd" onclick={() => client.setMode("attackMove")} title="Attaque en mouvement"><Icon name="attack" size={17} /><span class="key">A</span></button>
        <button class="cmd" onclick={() => client.setMode("patrol")} title="Patrouille"><Icon name="patrol" size={17} /><span class="key">P</span></button>
        <button class="cmd" onclick={() => client.setMode("assist")} title="Escorter / assister"><Icon name="assist" size={17} /><span class="key">G</span></button>
        <button class="cmd" onclick={() => client.setMode("attackGround")} title="Tir au sol"><Icon name="ground" size={17} /></button>
        {#if anyEng}<button class="cmd" onclick={() => client.setMode("reclaim")} title="Recycler"><Icon name="reclaim" size={17} /><span class="key">E</span></button>{/if}
        {#if deployable}<button class="cmd" onclick={() => client.deploySelected()} title="Déployer"><Icon name="deploy" size={17} /><span class="key">F</span></button>{/if}
        {#if anyCarrier}<button class="cmd" onclick={() => client.setMode("unload")} title="Décharger"><Icon name="unload" size={17} /><span class="key">U</span></button>{/if}
        {#if has("commander") && hasTechUI(35)}<button class="cmd" onclick={() => client.setMode("teleport")} title="Téléportation"><Icon name="teleport" size={17} /></button>{/if}
        {#if has("hyper_cruiser")}<button class="cmd" onclick={() => client.setMode("jump")} title="Saut hyperespace"><Icon name="jump" size={17} /></button>{/if}
      </div>
    {/if}
    {#if anyEng}<span class="dim small">Choisissez un bâtiment à droite. Clic droit sur une épave : recycler.</span>{/if}
  </div>
{/if}

<style>
  /* pas de défilement : les infobulles doivent pouvoir sortir du panneau */
  .sel { padding: 11px 13px; min-width: 280px; max-width: 520px; display: flex; flex-direction: column; gap: 8px; }
  .head { display: flex; gap: 11px; align-items: center; }
  .thumb { width: 56px; height: 56px; flex-shrink: 0; display: grid; place-items: center; background: radial-gradient(circle at 50% 60%, color-mix(in srgb, var(--pc) 30%, transparent), transparent 70%); border: 1px solid var(--line); }
  .thumb img { width: 52px; height: 52px; object-fit: contain; }
  .ht { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
  .title { font-size: 15px; font-weight: 600; letter-spacing: 0.04em; }
  .hpline { display: flex; align-items: center; gap: 8px; }
  .hpline .hp { flex: 1; display: block; }
  .hpline .hp > span { display: block; height: 100%; background: linear-gradient(90deg, var(--good), #a8ffd8); box-shadow: 0 0 6px rgba(77, 255, 176, 0.5); }
  .hpline .hp.mid > span { background: linear-gradient(90deg, var(--amber), #ffd28a); }
  .hpline .hp.low > span { background: linear-gradient(90deg, var(--bad), #ff8a95); }
  .status { display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--dim); }
  .led { width: 7px; height: 7px; background: var(--dim); }
  .status.good { color: var(--good); }
  .status.good .led { background: var(--good); box-shadow: 0 0 8px var(--good); }
  .status.warn { color: var(--warn); }
  .status.warn .led { background: var(--warn); box-shadow: 0 0 8px var(--warn); animation: blink 1s infinite; }
  .status.build { color: var(--accent); }
  .status.build .led { background: var(--accent); box-shadow: 0 0 8px var(--accent); }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .flow { display: flex; gap: 8px; align-items: center; padding: 6px 8px; background: rgba(62, 240, 255, 0.04); border: 1px solid var(--line); }
  .arrow { color: var(--accent); letter-spacing: -2px; }
  .units { display: grid; grid-template-columns: repeat(auto-fill, 52px); gap: 4px; }
  .ub { position: relative; width: 52px; height: 52px; padding: 2px; display: grid; place-items: center; }
  .ub img { width: 44px; height: 44px; object-fit: contain; }
  .ub.locked img { filter: grayscale(1) brightness(0.5); }
  .qn { position: absolute; right: 3px; bottom: 2px; font-size: 11px; color: var(--accent-ink); background: var(--accent); padding: 0 3px; font-weight: 600; }
  .lk { position: absolute; left: 3px; top: 3px; color: var(--amber); }
  .rep { display: inline-flex; align-items: center; gap: 6px; }
  .uhead { display: flex; align-items: baseline; gap: 8px; }
  .uhead .title { font-size: 20px; color: var(--accent); }
  .groups { display: flex; flex-wrap: wrap; gap: 4px; }
  .grp { position: relative; width: 50px; height: 50px; padding: 2px; display: grid; place-items: center; }
  .grp img { width: 42px; height: 42px; object-fit: contain; }
  .ab { font-weight: 700; font-size: 12px; }
  .cnt { position: absolute; right: 3px; bottom: 1px; font-size: 11px; color: #fff; text-shadow: 0 0 4px #000, 0 0 2px #000; }
  .cmds { display: flex; flex-wrap: wrap; gap: 4px; }
  .cmd { position: relative; width: 40px; height: 36px; display: grid; place-items: center; padding: 0; color: var(--accent); }
  .cmd:hover:not(:disabled) { color: #fff; }
  .cmd .key { position: absolute; right: 2px; top: 1px; font-size: 8.5px; border: none; padding: 0; opacity: 0.7; }
  .sel :global(.tip .tt) { bottom: calc(100% + 8px); }
  @keyframes blink { 50% { opacity: 0.3; } }
</style>
