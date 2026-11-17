<script lang="ts">
  // Rapport de fin de partie : résultat, durée, bilan de chaque joueur et courbes de toute la partie.
  import { ui } from "../game/state.svelte.ts";
  import Icon from "./Icon.svelte";
  import Charts from "./Charts.svelte";
  import { sprite } from "./sprites.ts";
  import { playerColor, summarize, duration, fmt } from "./stats.ts";

  const emblem = sprite("art", "emblem");
  const over = $derived(ui.gameOver!);
  const samples = $derived(ui.stats);
  const all = $derived(ui.players.map((_, i) => i));
  const endTick = $derived(Math.max(ui.tick, samples.length ? samples[samples.length - 1].tick : 0));
  const rows = $derived(all.map((i) => ({ i, p: ui.players[i], s: summarize(samples, i) })));
  const best = $derived.by(() => {
    const m = (f: (r: (typeof rows)[number]) => number) => Math.max(0, ...rows.map(f));
    return {
      army: m((r) => r.s?.maxArmy ?? 0),
      value: m((r) => r.s?.maxArmyValue ?? 0),
      ore: m((r) => r.s?.ore ?? 0),
      research: m((r) => r.s?.research ?? 0),
      buildings: m((r) => r.s?.maxBuildings ?? 0),
      kills: m((r) => r.s?.kills ?? r.p.kills),
    };
  });
  const top = (v: number, b: number) => b > 0 && v === b;
</script>

<div class="endwrap">
  <div class="end panel" class:won={over.won && !ui.spectator} class:lost={!over.won && !ui.spectator}>
    <header>
      {#if emblem}<img class="emb" src={emblem} alt="" />{/if}
      <div class="title">
        {#if ui.spectator}
          <div class="kicker">Fin de la partie</div>
          <h1>{over.winner >= 0 ? "Équipe " + (over.winner + 1) : "Aucun vainqueur"}</h1>
        {:else}
          <div class="kicker">Rapport de fin de mission</div>
          <h1>{over.won ? "Victoire" : "Défaite"}</h1>
        {/if}
      </div>
      <div class="dur">
        <span class="kicker"><Icon name="clock" size={12} /> Durée</span>
        <span class="num">{duration(endTick)}</span>
      </div>
    </header>
    <div class="body">
      <table>
        <thead>
          <tr>
            <th>Joueur</th>
            <th class="r">Équipe</th>
            <th class="r" title="Nombre maximal d'unités de combat en même temps">Armée max</th>
            <th class="r" title="Valeur maximale de l'armée, en matière (minerai = 1)">Valeur max</th>
            <th class="r">Minerai extrait</th>
            <th class="r">Recherches</th>
            <th class="r" title="Nombre maximal de bâtiments terminés (hors tapis et bras)">Bâtiments</th>
            <th class="r">Destructions</th>
            <th class="r">Pertes</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as { i, p, s } (i)}
            <tr class:out={!p.alive} class:win={p.team === over.winner}>
              <td class="name"><span class="pc" style:background={playerColor(i)}></span><span class="nm">{p.name}</span>{#if p.bot} <Icon name="bot" size={12} />{/if}</td>
              <td class="r num">{p.team + 1}</td>
              {#if s}
                <td class="r num" class:top={top(s.maxArmy, best.army)}>{fmt(s.maxArmy)}</td>
                <td class="r num" class:top={top(s.maxArmyValue, best.value)}>{fmt(s.maxArmyValue)}</td>
                <td class="r num" class:top={top(s.ore, best.ore)}>{fmt(s.ore)}</td>
                <td class="r num" class:top={top(s.research, best.research)}>{s.research}</td>
                <td class="r num" class:top={top(s.maxBuildings, best.buildings)}>{fmt(s.maxBuildings)}</td>
              {:else}
                <td class="r faint">—</td><td class="r faint">—</td><td class="r faint">—</td><td class="r faint">—</td><td class="r faint">—</td>
              {/if}
              <td class="r num good" class:top={top(s?.kills ?? p.kills, best.kills)}>{fmt(s?.kills ?? p.kills)}</td>
              <td class="r num bad">{fmt(s?.losses ?? p.losses)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if samples.length}
        <Charts {samples} players={all} />
      {:else}
        <p class="dim nostats">Aucun relevé statistique pour cette partie.</p>
      {/if}
    </div>
    <div class="row">
      {#if over.replay}<a href={over.replay} download><button class="icon-btn"><Icon name="replay" size={14} /> Télécharger le replay</button></a>{/if}
      <button class="icon-btn" onclick={() => (ui.gameOver = null)}><Icon name="eye" size={14} /> Continuer à regarder</button>
      <button class="primary" onclick={() => location.reload()}>Retour au salon</button>
    </div>
  </div>
</div>

<style>
  .endwrap { position: absolute; inset: 0; z-index: 40; display: grid; place-items: center; padding: 16px; background: radial-gradient(circle, rgba(2, 5, 9, 0.55), rgba(2, 5, 9, 0.88)); animation: fade 0.4s ease-out; }
  .end { width: min(1180px, 100%); max-height: calc(100vh - 32px); padding: 18px 26px 16px; display: flex; flex-direction: column; gap: 12px; }
  header { display: flex; align-items: center; gap: 16px; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
  .emb { width: 60px; height: 60px; filter: drop-shadow(0 0 18px rgba(62, 240, 255, 0.5)); }
  .title { flex: 1; min-width: 0; }
  h1 { margin: 2px 0 0; font-size: 38px; font-weight: 700; letter-spacing: 0.22em; line-height: 1.05; }
  .won h1 { color: var(--accent); text-shadow: 0 0 24px rgba(62, 240, 255, 0.6); }
  .lost h1 { color: var(--bad); text-shadow: 0 0 24px rgba(255, 77, 94, 0.5); }
  .lost .emb { filter: grayscale(1) drop-shadow(0 0 14px rgba(255, 77, 94, 0.5)); }
  .dur { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
  .dur .kicker { display: inline-flex; align-items: center; gap: 4px; }
  .dur .num { font-size: 20px; color: var(--text); }
  .body { overflow: auto; min-height: 0; padding-right: 4px; display: flex; flex-direction: column; gap: 16px; }
  table { width: 100%; }
  td, th { padding: 5px 8px; text-align: left; border-bottom: 1px solid rgba(255, 255, 255, 0.05); white-space: nowrap; }
  th { font-size: 10px; }
  .r { text-align: right; }
  td.name { display: flex; align-items: center; gap: 4px; }
  .nm { max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
  td.top { color: var(--accent); font-weight: 600; }
  td.good.top { color: var(--good); }
  tr.win td.name { color: #fff; }
  tr.out td.name { color: var(--dim); }
  tr.out td.name .nm { text-decoration: line-through; text-decoration-color: rgba(255, 77, 94, 0.5); }
  .pc { display: inline-block; width: 9px; height: 9px; margin-right: 6px; transform: rotate(45deg); flex-shrink: 0; }
  .nostats { margin: 0; }
  .row { display: flex; gap: 8px; align-items: center; justify-content: center; flex-wrap: wrap; padding-top: 10px; border-top: 1px solid var(--line); }
  @media (max-width: 760px) { h1 { font-size: 28px; } .emb { display: none; } }
  @keyframes fade { from { opacity: 0; } }
</style>
