<script lang="ts">
  import { ui } from "../game/state.svelte.ts";
  import { client } from "../game/client.ts";
  import { PLAYER_COLORS, PLAYER_COLOR_NAMES } from "../models/generator.ts";

  const lobby = $derived(ui.lobby);
  const isHost = $derived(!!lobby && lobby.players.some((p) => p.host && p.slot === ui.slot));
  const PERS: Record<string, string> = { adaptive: "Adaptative", rush: "Rush", turtle: "Tortue", tech: "Technologique" };
  let replays = $state<string[]>([]);
  let showReplays = $state(false);
  async function loadReplays() {
    showReplays = !showReplays;
    if (showReplays) replays = await (await fetch("/api/replays")).json();
  }
  const color = (i: number) => "#" + PLAYER_COLORS[i % 8].toString(16).padStart(6, "0");
  const invite = location.origin + "/" + (new URLSearchParams(location.search).get("k") || localStorage.getItem("supreme.key") ? "?k=" + (new URLSearchParams(location.search).get("k") ?? localStorage.getItem("supreme.key")) : "");
  let copied = $state(false);
  function copy() {
    navigator.clipboard?.writeText(invite);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

<div class="lobby">
  <div class="panel box">
    <h1>Suprématie <span class="dim">· salon</span></h1>
    {#if !ui.connected}
      <p class="warn">Connexion au serveur…</p>
    {:else if lobby}
      {#if lobby.running}
        <p class="warn">Une partie est en cours (tick {lobby.tick}). Vous la rejoindrez comme spectateur ou reprendrez votre place.</p>
      {/if}
      <table>
        <thead><tr><th></th><th>Joueur</th><th>Équipe</th><th>IA</th><th></th></tr></thead>
        <tbody>
          {#each lobby.players as p (p.slot)}
            <tr class:me={p.slot === ui.slot}>
              <td><span class="sw big" style:background={color(p.slot)} title={PLAYER_COLOR_NAMES[p.slot % 8]}></span></td>
              <td>{p.name} {#if p.host}<span class="dim">(hôte)</span>{/if} {#if !p.connected}<span class="bad">déconnecté</span>{/if}</td>
              <td>
                {#if isHost && !lobby.running}
                  <select value={p.team} onchange={(e) => client.lobbyAction("setTeam", { slot: p.slot, team: Number((e.target as HTMLSelectElement).value) })}>
                    {#each [0, 1, 2, 3, 4, 5, 6, 7] as t}<option value={t}>Équipe {t + 1}</option>{/each}
                  </select>
                {:else}Équipe {p.team + 1}{/if}
              </td>
              <td>
                {#if p.bot}
                  {#if isHost && !lobby.running}
                    <select value={p.personality} onchange={(e) => client.lobbyAction("setBot", { slot: p.slot, personality: (e.target as HTMLSelectElement).value })}>
                      {#each Object.entries(PERS) as [k, v]}<option value={k}>{v}</option>{/each}
                    </select>
                    <select value={p.aix ?? 100} title="Variante AIx : multiplicateur de ressources et de vitesse de construction" onchange={(e) => client.lobbyAction("setBot", { slot: p.slot, aix: Number((e.target as HTMLSelectElement).value) })}>
                      {#each [100, 120, 150, 200, 300] as a}<option value={a}>{a === 100 ? "Normal" : "AIx ×" + a / 100}</option>{/each}
                    </select>
                  {:else}{PERS[p.personality ?? "adaptive"]} {p.aix && p.aix > 100 ? "AIx ×" + p.aix / 100 : ""}{/if}
                {/if}
              </td>
              <td>{#if isHost && p.bot && !lobby.running}<button onclick={() => client.lobbyAction("removeSlot", { slot: p.slot })}>Retirer</button>{/if}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if isHost && !lobby.running}
        <div class="row">
          <span>Ajouter une IA :</span>
          {#each Object.entries(PERS) as [k, v]}
            <button disabled={lobby.players.length >= 8} onclick={() => client.lobbyAction("addBot", { personality: k })}>{v}</button>
          {/each}
        </div>
        <div class="row">
          <label>Carte
            <select value={lobby.mapSize} onchange={(e) => client.lobbyAction("setMap", { mapSize: Number((e.target as HTMLSelectElement).value) })}>
              <option value={512}>10 km (512 × 512)</option>
              <option value={1024}>20 km (1024 × 1024)</option>
            </select></label>
          <label><input type="checkbox" checked={lobby.water} onchange={(e) => client.lobbyAction("setMap", { water: (e.target as HTMLInputElement).checked })} /> Eau</label>
          <label>Graine <input type="number" value={lobby.seed} style="width:120px" onchange={(e) => client.lobbyAction("setMap", { seed: Number((e.target as HTMLInputElement).value) })} /></label>
        </div>
        <button class="start" onclick={() => client.lobbyAction("start")}>Lancer la partie</button>
      {:else}
        <p class="dim">Carte {lobby.mapSize === 1024 ? "20 km" : "10 km"} {lobby.water ? "avec eau" : "sans eau"}, graine {lobby.seed}. {#if !lobby.running}L'hôte lance la partie.{/if}</p>
      {/if}
      <div class="row foot">
        <button onclick={copy}>{copied ? "Lien copié" : "Copier le lien d'invitation"}</button>
        <button onclick={loadReplays}>Replays</button>
        <span class="dim">Vous : {ui.name}</span>
      </div>
      {#if showReplays}
        <div class="replays">
          {#each replays as r}
            <button onclick={() => client.loadReplay("/replays/" + r)}>{r.replace("partie-", "").replace(".json", "")}</button>
          {:else}<span class="dim">Aucun replay pour l'instant.</span>{/each}
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .lobby { position: fixed; inset: 0; display: grid; place-items: center; z-index: 30; background: radial-gradient(circle at 50% 30%, #1a2a3a, #0a0f14 70%); }
  .box { padding: 20px 26px; min-width: 640px; max-width: 900px; display: flex; flex-direction: column; gap: 12px; }
  h1 { margin: 0; font-size: 24px; }
  table { border-collapse: collapse; width: 100%; }
  th { text-align: left; color: var(--dim); font-weight: normal; padding: 4px; }
  td { padding: 4px; border-top: 1px solid var(--line); }
  tr.me td { background: rgba(79, 179, 255, 0.08); }
  .sw.big { width: 16px; height: 16px; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .start { font-size: 16px; padding: 8px; background: #2a5a86; }
  .foot { border-top: 1px solid var(--line); padding-top: 10px; }
  .replays { display: flex; flex-direction: column; gap: 4px; max-height: 200px; overflow: auto; }
</style>
