<script lang="ts">
  // Barre des ressources : la zone électrique (Souche : le réseau de racines) au centre de l'écran, sur quatre
  // lignes : stock, production maximale, consommation maximale, solde (débits par minute). Données : requête
  // zoneEconomy (sim/src/zone_eco.rs), 4 fois par seconde au plus.
  import { ui } from "../game/state.svelte.ts";
  import { SEVE, SELS, EAU, ADN, RELEVES, RACE_SOUCHE, RACE_TRANSH } from "@supreme/shared";
  import Item from "./Item.svelte";
  import Icon from "./Icon.svelte";
  import { itemTip } from "../game/itemDescs.ts";

  // ressources de base (plaques, acier, engrenages, câbles, circuits) : seules montrées, barre repliée ;
  // dépliée, s'y ajoutent les minerais et les autres objets qui ont un stock ou un débit dans la zone
  const BASE = [6, 7, 8, 10, 11, 12];
  const ALL_KEY = "supreme.zoneBarOpen";
  let all = $state(readAll());
  function readAll() {
    try { return localStorage.getItem(ALL_KEY) === "1"; } catch { return false; }
  }
  function toggleAll() {
    all = !all;
    try { localStorage.setItem(ALL_KEY, all ? "1" : "0"); } catch { /* sans stockage : réglage non retenu */ }
  }
  const z = $derived(ui.zone);
  const souche = $derived(ui.race === RACE_SOUCHE);
  const at = (v: number[] | undefined, id: number) => v?.[id] ?? 0;
  /** Objets autres que ceux de base qui ont un stock ou un débit dans la zone (montrés barre dépliée). */
  const extra = $derived.by(() => {
    if (!z || z.zone === 0 || souche) return [];
    const out: number[] = [];
    for (let id = 1; id < SEVE; id++) {
      if (!BASE.includes(id) && (at(z.stock, id) > 0 || at(z.prod, id) > 0 || at(z.cons, id) > 0)) out.push(id);
    }
    return out;
  });
  const cols = $derived.by(() => {
    if (!z || z.zone === 0) return [];
    if (souche) return [SEVE, SELS, EAU, ADN];
    const ids = all ? [...BASE, ...extra].sort((a, b) => a - b) : BASE;
    return ui.race === RACE_TRANSH ? [RELEVES, ...ids] : ids;
  });
  // zone vivante mais sans générateur qui brûle (relais seuls) : éteinte, comme dans la vue électrique
  const dead = $derived(z?.zone === 2 || (z?.zone === 1 && ui.powerNets.some((n) => n.id === z.net && n.dead)));
  const label = $derived(!z || z.zone === 0 ? "Hors zone" : souche ? "Réseau" : dead ? "Zone éteinte" : "Zone");
  const hex = (c: number) => "#" + c.toString(16).padStart(6, "0");
  /** Débit en centièmes par minute → texte (une décimale sous 10, k au-delà de 10 000). */
  const rate = (c: number) => {
    const v = Math.abs(c) / 100;
    if (v >= 10000) return Math.round(v / 1000) + "k";
    if (v >= 10 || Number.isInteger(v)) return String(Math.round(v));
    return v.toFixed(1).replace(".", ",").replace(/,0$/, "");
  };
  const rounded = (c: number) => Math.abs(c) < 5;
  // lignes des débits (production, consommation, solde) repliables ; le choix est gardé d'une partie à l'autre
  let open = $state(readOpen());
  function readOpen() {
    try {
      return localStorage.getItem("supreme.zoneRates") !== "0";
    } catch {
      return true;
    }
  }
  function toggle() {
    open = !open;
    try {
      localStorage.setItem("supreme.zoneRates", open ? "1" : "0");
    } catch {
      /* stockage indisponible : le choix vaut pour cette page */
    }
  }
</script>

<div class="zbar" class:off={!z || z.zone === 0} class:shut={!open}>
  <span class="head">
  <span class="tip lab zone">
    <i class="sw" class:dead style:background={z && z.zone !== 0 ? hex(dead ? 0xff4a3d : z.color) : "transparent"}></i>
    <span class="zn">{label}</span>
    <span class="tt">
      {#if !z || z.zone === 0}
        <b>Hors zone</b><br />Centrez la vue sur une de vos bases.
      {:else if souche}
        <b>Réseau de racines au centre de l'écran</b><br />Sa réserve et ses débits. Vue des racines : K.
      {:else}
        <b>{dead ? "Zone éteinte" : "Zone électrique"} au centre de l'écran</b><br />Vue électrique : K.{#if dead} Plus de combustible : machines à l'arrêt.{/if}<br /><span class="num">{z.machines ?? 0}</span> machine{(z.machines ?? 0) > 1 ? "s" : ""} comptée{(z.machines ?? 0) > 1 ? "s" : ""}.
      {/if}
    </span>
  </span>
  {#if z && z.zone !== 0}
    <button class="ghost fold" class:shut={!open} onclick={toggle} title={open ? "Replier les débits" : "Déplier les débits"} aria-expanded={open}><Icon name="chevron" size={12} /></button>
  {/if}
  </span>
  {#if z && z.zone !== 0}
    {#if open}
      <span class="lab">Prod. max<span class="faint">/min</span></span>
      <span class="lab">Conso. max<span class="faint">/min</span></span>
      <span class="lab">Solde<span class="faint">/min</span></span>
    {/if}
    {#each cols as id (id)}
      {@const n = at(z.stock, id)}
      {@const p = at(z.prod, id)}
      {@const c = at(z.cons, id)}
      {@const net = p - c}
      {@const capped = !souche || id !== ADN}
      {@const fill = capped && (z.cap ?? 0) > 0 ? Math.min(1, n / (z.cap ?? 1)) : 0}
      {@const team = !souche ? (ui.teamStock[id] ?? 0) : 0}
      <span class="tip res" class:full={fill >= 1} class:near={fill >= 0.85 && fill < 1}>
        <Item {id} {n} size={18} />{#if capped}<span class="cap"><span style:width={fill * 100 + "%"}></span></span>{/if}{#if team > 0}<span class="team num">+{team >= 10000 ? Math.floor(team / 1000) + "k" : team}</span>{/if}
        <span class="tt full">
          <b>{ui.data?.items[id].name}</b><br />
          {#if ui.data}{@html itemTip(ui.data, id, ui.race, false)}<br /><br />{/if}
          {#if id === ADN || id === RELEVES}
            <span class="num">{n}</span> en réserve, partout<br />
          {:else if souche}
            <span class="num">{n}</span> dans la réserve de ce réseau (plafond <span class="num">{z.cap ?? 0}</span>)<br />
          {:else}
            <span class="num">{n}</span> dans cette zone<br />
            Capacité : <span class="num">{z.cap ?? 0}</span> de chaque objet{#if fill >= 1} <b class="bad">pleins</b>{/if}<br />
            {#if team > 0}<span class="num">{team}</span> dans les entrepôts de l'équipe<br />{/if}
          {/if}
          Production maximale : <span class="num">{rate(p)}</span> par minute<br />
          Consommation maximale : <span class="num">{rate(c)}</span> par minute<br />
          Solde : <span class="num" class:good={net > 0 && !rounded(net)} class:bad={net < 0 && !rounded(net)}>{net < 0 ? "−" : "+"}{rate(net)}</span> par minute<br />
          <span class="dim">Débits à pleine vitesse, sans pénurie.</span>
        </span>
      </span>
      {#if open}
      <span class="r num" class:z={p === 0}>{p === 0 ? "·" : "+" + rate(p)}</span>
      <span class="r num" class:z={c === 0}>{c === 0 ? "·" : "−" + rate(c)}</span>
      <span class="r num s" class:z={rounded(net)} class:good={net > 0 && !rounded(net)} class:bad={net < 0 && !rounded(net)}>{rounded(net) ? "0" : (net < 0 ? "−" : "+") + rate(net)}</span>
      {/if}
    {/each}
    {#if !souche}
      <button class="tip more" class:open={all} onclick={toggleAll} aria-expanded={all}>
        <span>{all ? "‹" : "›"}</span>{#if !all && extra.length > 0}<span class="n num">+{extra.length}</span>{/if}
        <span class="tt">
          {#if all}<b>Replier</b><br />Seulement les ressources de base.
          {:else}<b>Déplier</b><br />Toutes les ressources de la zone.{/if}
        </span>
      </button>
    {/if}
  {/if}
</div>

<style>
  .zbar { display: grid; grid-template-rows: repeat(4, 17px); grid-auto-flow: column; column-gap: 11px; row-gap: 1px; align-items: center; }
  .zbar.off, .zbar.shut { grid-template-rows: 17px; }
  .head { display: flex; align-items: center; gap: 4px; }
  .fold { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; padding: 0; color: var(--dim); }
  .fold:hover { color: var(--accent); }
  .fold.shut :global(.ic) { transform: rotate(-90deg); }
  .lab { font-size: 10.5px; color: var(--dim); white-space: nowrap; letter-spacing: 0.02em; }
  .lab .faint { margin-left: 2px; }
  .zone { display: flex; align-items: center; gap: 5px; color: var(--text); font-size: 11.5px; }
  .zone .sw { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; box-shadow: 0 0 5px currentColor; }
  .zone .sw.dead { background-image: repeating-linear-gradient(45deg, rgba(0, 0, 0, 0.45) 0 2px, transparent 2px 4px); }
  .off .zone .zn { color: var(--amber); }
  .r { font-size: 11px; text-align: right; color: var(--text); white-space: nowrap; }
  .r.z { color: var(--faint, rgba(255, 255, 255, 0.28)); }
  .r.s { font-weight: 600; }
  .good { color: var(--good, #45d483) !important; }
  .bad { color: var(--bad, #ff5a4f) !important; }
  .res { position: relative; display: flex; align-items: center; justify-content: flex-end; }
  .res :global(.num) { font-size: 12px; }
  /* remplissage des dépôts de la zone (capacité par objet) */
  .res .cap { position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: rgba(255, 255, 255, 0.1); pointer-events: none; }
  .res .cap > span { display: block; height: 100%; background: var(--accent); opacity: 0.7; }
  .res.near .cap > span { background: var(--amber); opacity: 1; }
  .res.full .cap > span { background: var(--bad, #ff5a4f); opacity: 1; }
  .res.full :global(.num) { color: var(--bad, #ff5a4f); }
  .more { grid-row: 1 / -1; align-self: stretch; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-width: 18px; padding: 0 3px; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 4px; background: rgba(255, 255, 255, 0.04); color: var(--dim); font-size: 14px; line-height: 1; cursor: pointer; }
  .more:hover { color: var(--text); background: rgba(255, 255, 255, 0.09); }
  .more .n { font-size: 10px; color: var(--accent); }
  .shut .more { flex-direction: row; gap: 3px; padding: 0 5px; }
  .res .team { font-size: 10px; color: var(--accent); margin-left: 1px; opacity: 0.9; }
</style>
