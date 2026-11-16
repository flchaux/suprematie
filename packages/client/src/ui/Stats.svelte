<script lang="ts">
  import { ui } from "../game/state.svelte.ts";
  import { client } from "../game/client.ts";
  import Item from "./Item.svelte";
  import { PLAYER_COLORS } from "../models/generator.ts";
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
  const color = (i: number) => "#" + PLAYER_COLORS[i % 8].toString(16).padStart(6, "0");
</script>

<div class="modal panel">
  <button class="close" onclick={() => (ui.showStats = false)}>Fermer (Tab)</button>
  <h2>Statistiques</h2>
  <div class="two">
    <div>
      <h3>Production (par minute)</h3>
      <table>
        <thead><tr><th>Objet</th><th>Produit</th><th>Consommé</th><th>Stock</th><th>Total produit</th></tr></thead>
        <tbody>
          {#each ui.data?.items ?? [] as it, i}
            {#if i > 0 && ((ui.produced[i] ?? 0) > 0 || (ui.stock[i] ?? 0) > 0)}
              <tr><td><Item id={i} /> {it.name}</td><td class="good">{rates.p[i] ?? 0}</td><td class="warn">{rates.c[i] ?? 0}</td><td>{ui.stock[i]}</td><td class="dim">{ui.produced[i]}</td></tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
    <div>
      <h3>Joueurs</h3>
      <table>
        <thead><tr><th>Joueur</th><th>Équipe</th><th>Unités</th><th>Énergie</th><th>Destructions</th><th>Pertes</th></tr></thead>
        <tbody>
          {#each ui.players as p, i}
            <tr class:dim={!p.alive}><td><span class="sw" style:background={color(i)}></span> {p.name}{p.bot ? " (IA)" : ""}</td><td>{p.team + 1}</td><td>{p.units}</td><td>{p.power} kW</td><td>{p.kills}</td><td>{p.losses}</td></tr>
          {/each}
        </tbody>
      </table>
      {#if ui.me >= 0}<p><button onclick={() => confirm("Abandonner la partie ?") && client.surrender()}>Abandonner</button></p>{/if}
    </div>
  </div>
</div>

<style>
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  table { border-collapse: collapse; width: 100%; }
  td, th { padding: 2px 6px; text-align: left; }
  th { color: var(--dim); font-weight: normal; }
  h3 { margin: 6px 0; font-size: 14px; }
</style>
