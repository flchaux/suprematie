<script lang="ts">
  import { ui } from "../game/state.svelte.ts";
  import { client } from "../game/client.ts";
  import Item from "./Item.svelte";
  import Icon from "./Icon.svelte";
  import Charts from "./Charts.svelte";
  import { keyOf } from "../game/keys.svelte.ts";
  import { playerColor as color, visiblePlayers, shownSamples, seesAll } from "./stats.ts";
  // historique pour calculer des débits par minute
  let hist: { t: number; p: number[]; c: number[] }[] = [];
  let rates = $state<{ p: number[]; c: number[] }>({ p: [], c: [] });
  $effect(() => {
    const t = ui.tick;
    if (!ui.produced.length) return;
    hist.push({ t, p: [...ui.produced], c: [...ui.consumed] });
    hist = hist.filter((h) => t - h.t <= 1200);
    const old = hist[0];
    const dt = Math.max(1, t - old.t) / 1200;
    rates = { p: ui.produced.map((v, i) => Math.round((v - old.p[i]) / dt)), c: ui.consumed.map((v, i) => Math.round((v - old.c[i]) / dt)) };
  });
  // onglet affiché (gardé d'une ouverture à l'autre)
  let tab = $state<"production" | "curves">(lastTab);
  $effect(() => {
    lastTab = tab;
  });
  const shown = $derived(visiblePlayers());
</script>

<script lang="ts" module>
  let lastTab: "production" | "curves" = "production";
</script>

<div class="modal panel">
  <button class="close ghost icon-btn" onclick={() => (ui.showStats = false)} title="Fermer{keyOf('stats') ? ` (${keyOf('stats')})` : ''}"><Icon name="close" /></button>
  <div class="modal-head">
    <Icon name="stats" size={26} />
    <div>
      <div class="kicker">Rapport</div>
      <h2>Statistiques</h2>
    </div>
    <div class="tabs" role="tablist">
      <button role="tab" class="icon-btn" class:on={tab === "production"} aria-selected={tab === "production"} onclick={() => (tab = "production")}><Icon name="production" size={14} /> Production</button>
      <button role="tab" class="icon-btn" class:on={tab === "curves"} aria-selected={tab === "curves"} onclick={() => (tab = "curves")}><Icon name="stats" size={14} /> Courbes</button>
    </div>
  </div>
  <div class="modal-body">
    {#if tab === "curves"}
      <Charts samples={shownSamples()} players={shown} note={seesAll() ? "Relevé toutes les 30 s" : "Votre équipe uniquement · relevé toutes les 30 s"} />
    {:else}
    <div class="two">
      <section>
        <h3>Production <span class="dim">· par minute</span></h3>
        <table>
          <thead><tr><th>Objet</th><th class="r">Produit</th><th class="r">Consommé</th><th class="r">Stock</th><th class="r">Total</th></tr></thead>
          <tbody>
            {#each ui.data?.items ?? [] as it, i}
              {#if i > 0 && ((ui.produced[i] ?? 0) > 0 || (ui.stock[i] ?? 0) > 0)}
                {@const net = (rates.p[i] ?? 0) - (rates.c[i] ?? 0)}
                <tr>
                  <td><Item id={i} size={20} /> {it.name}</td>
                  <td class="r num good">{rates.p[i] ?? 0}</td>
                  <td class="r num warn">{rates.c[i] ?? 0}</td>
                  <td class="r num" class:bad={net < 0 && (ui.stock[i] ?? 0) < 50}>{ui.stock[i]}</td>
                  <td class="r num dim">{ui.produced[i]}</td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </section>
      <section>
        <h3>Joueurs</h3>
        <table>
          <thead><tr><th>Joueur</th><th class="r">Équipe</th><th class="r">Unités</th><th class="r">Énergie</th><th class="r">Destr.</th><th class="r">Pertes</th></tr></thead>
          <tbody>
            {#each shown as i (i)}
              {@const p = ui.players[i]}
              <tr class:out={!p.alive}>
                <td><span class="pc" style:background={color(i)}></span>{p.name}{#if p.bot} <Icon name="bot" size={12} />{/if}</td>
                <td class="r num">{p.team + 1}</td><td class="r num">{p.units}</td><td class="r num">{p.power} kW</td><td class="r num good">{p.kills}</td><td class="r num bad">{p.losses}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if ui.me >= 0}<p class="surr">
          <button class="icon-btn" title="Sauvegarde la partie sur le serveur ; l'hôte pourra la recharger depuis le salon" onclick={() => client.saveGame()}><Icon name="save" size={14} /> Sauvegarder</button>
          <button class="icon-btn danger" onclick={() => confirm("Abandonner la partie ?") && client.surrender()}><Icon name="flag" size={14} /> Abandonner</button>
        </p>{/if}
      </section>
    </div>
    {/if}
  </div>
</div>

<style>
  .modal-head > :global(.ic) { color: var(--accent); }
  .tabs { margin-left: auto; margin-right: 34px; display: flex; gap: 6px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; }
  h3 { margin: 0 0 8px; font-size: 13px; }
  table { width: 100%; }
  td, th { padding: 4px 8px; text-align: left; }
  td { border-bottom: 1px solid rgba(255, 255, 255, 0.04); }
  .r { text-align: right; }
  td:first-child { display: flex; align-items: center; gap: 6px; }
  .pc { display: inline-block; width: 9px; height: 9px; margin-right: 8px; transform: rotate(45deg); }
  tr.out td { color: var(--faint); }
  .surr { margin-top: 14px; display: flex; gap: 8px; flex-wrap: wrap; }
  @media (max-width: 1000px) { .two { grid-template-columns: 1fr; } }
</style>
