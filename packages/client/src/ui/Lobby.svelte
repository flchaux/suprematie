<script lang="ts">
  import { ui } from "../game/state.svelte.ts";
  import { client } from "../game/client.ts";
  import { PLAYER_COLORS, PLAYER_COLOR_NAMES } from "../models/generator.ts";
  import Icon from "./Icon.svelte";
  import { sprite } from "./sprites.ts";

  const lobby = $derived(ui.lobby);
  const isHost = $derived(!!lobby && lobby.players.some((p) => p.host && p.slot === ui.slot));
  const PERS: Record<string, string> = { adaptive: "Adaptative", rush: "Rush", turtle: "Tortue", tech: "Technologique" };
  const LEVELS: Record<string, string> = { facile: "Facile", normal: "Normal", difficile: "Difficile" };
  const PERS_DESC: Record<string, string> = {
    adaptive: "Équilibrée, s'adapte à l'adversaire",
    rush: "Attaque tôt et souvent",
    turtle: "Défenses lourdes, attaque tard",
    tech: "Mise sur la recherche et les unités avancées",
  };
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
  const keyart = sprite("art", "keyart");
  const emblem = sprite("art", "emblem");
  const teams = $derived(lobby ? new Set(lobby.players.map((p) => p.team)).size : 0);
</script>

<div class="screen" style={keyart ? `--keyart: url(${keyart})` : ""}>
  <div class="wrap">
    <header class="brand">
      {#if emblem}<img src={emblem} alt="" />{/if}
      <div>
        <h1>Suprématie</h1>
        <div class="kicker">Salon de préparation{#if lobby} · {lobby.players.length}/8 joueurs · {teams} équipe{teams > 1 ? "s" : ""}{/if}</div>
      </div>
    </header>

    {#if !ui.connected}
      <div class="panel box"><p class="warn">Connexion au serveur…</p></div>
    {:else if lobby}
      {#if lobby.running}
        <div class="panel notice"><Icon name="alert" size={15} /> Une partie est en cours (tick <span class="num">{lobby.tick}</span>). Vous la rejoindrez comme spectateur ou reprendrez votre place.</div>
      {/if}
      <div class="cols">
        <section class="panel box">
          <div class="kicker">Forces en présence</div>
          <div class="players">
            {#each lobby.players as p (p.slot)}
              <div class="player" class:me={p.slot === ui.slot} style:--pc={color(p.slot)}>
                <span class="tag" title={PLAYER_COLOR_NAMES[p.slot % 8]}></span>
                <div class="who">
                  <div class="name">
                    {#if p.bot}<Icon name="bot" size={15} />{:else}<Icon name="user" size={15} />{/if}
                    <b>{p.name}</b>
                    {#if p.host}<span class="badge">Hôte</span>{/if}
                    {#if p.slot === ui.slot}<span class="badge you">Vous</span>{/if}
                    {#if !p.connected}<span class="badge off">Déconnecté</span>{/if}
                  </div>
                  {#if p.bot}
                    {#if isHost && !lobby.running}
                      <div class="opts">
                        <select value={p.personality} title="Personnalité de l'IA" onchange={(e) => client.lobbyAction("setBot", { slot: p.slot, personality: (e.target as HTMLSelectElement).value })}>
                          {#each Object.entries(PERS) as [k, v]}<option value={k}>{v}</option>{/each}
                        </select>
                        <select value={p.level ?? "normal"} title="Difficulté : réactivité, adaptation à l'adversaire, repli et entraide" onchange={(e) => client.lobbyAction("setBot", { slot: p.slot, level: (e.target as HTMLSelectElement).value })}>
                          {#each Object.entries(LEVELS) as [k, v]}<option value={k}>{v}</option>{/each}
                        </select>
                        <select value={p.aix ?? 100} title="Variante AIx : multiplicateur de ressources et de vitesse de construction" onchange={(e) => client.lobbyAction("setBot", { slot: p.slot, aix: Number((e.target as HTMLSelectElement).value) })}>
                          {#each [100, 120, 150, 200, 300] as a}<option value={a}>{a === 100 ? "Sans bonus" : "AIx ×" + a / 100}</option>{/each}
                        </select>
                      </div>
                    {:else}
                      <div class="dim small">{PERS[p.personality ?? "adaptive"]} · {LEVELS[p.level ?? "normal"]} · {PERS_DESC[p.personality ?? "adaptive"]}{p.aix && p.aix > 100 ? " · AIx ×" + p.aix / 100 : ""}</div>
                    {/if}
                  {:else}
                    <div class="dim small">Commandant · {PLAYER_COLOR_NAMES[p.slot % 8]}</div>
                  {/if}
                </div>
                <div class="team">
                  {#if isHost && !lobby.running}
                    <select value={p.team} title="Équipe" onchange={(e) => client.lobbyAction("setTeam", { slot: p.slot, team: Number((e.target as HTMLSelectElement).value) })}>
                      {#each [0, 1, 2, 3, 4, 5, 6, 7] as t}<option value={t}>Équipe {t + 1}</option>{/each}
                    </select>
                  {:else}<span class="chip"><Icon name="team" size={13} /> Équipe {p.team + 1}</span>{/if}
                  {#if isHost && p.bot && !lobby.running}
                    <button class="ghost danger icon-btn" title="Retirer" onclick={() => client.lobbyAction("removeSlot", { slot: p.slot })}><Icon name="trash" size={15} /></button>
                  {/if}
                </div>
              </div>
            {/each}
            {#if isHost && !lobby.running && lobby.players.length < 8}
              <div class="add">
                <span class="kicker">Ajouter une IA</span>
                <div class="addrow">
                  {#each Object.entries(PERS) as [k, v]}
                    <button class="icon-btn" title={PERS_DESC[k]} onclick={() => client.lobbyAction("addBot", { personality: k })}><Icon name="plus" size={13} /> {v}</button>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        </section>

        <aside class="panel box side">
          <div class="kicker">Théâtre d'opérations</div>
          {#if isHost && !lobby.running}
            <label class="set"><Icon name="map" /> <span>Carte</span>
              <select value={lobby.mapSize} onchange={(e) => client.lobbyAction("setMap", { mapSize: Number((e.target as HTMLSelectElement).value) })}>
                <option value={512}>10 km · 512 × 512</option>
                <option value={1024}>20 km · 1024 × 1024</option>
              </select></label>
            <label class="set"><Icon name="water" /> <span>Eau et îles</span><input type="checkbox" checked={lobby.water} onchange={(e) => client.lobbyAction("setMap", { water: (e.target as HTMLInputElement).checked })} /></label>
            <label class="set"><Icon name="seed" /> <span>Graine</span><input type="number" value={lobby.seed} onchange={(e) => client.lobbyAction("setMap", { seed: Number((e.target as HTMLInputElement).value) })} /></label>
            <div class="grow"></div>
            <button class="primary launch" onclick={() => client.lobbyAction("start")}><Icon name="play" size={15} /> Lancer la partie</button>
          {:else}
            <div class="set ro"><Icon name="map" /> <span>Carte</span><b>{lobby.mapSize === 1024 ? "20 km" : "10 km"}</b></div>
            <div class="set ro"><Icon name="water" /> <span>Eau</span><b>{lobby.water ? "Oui" : "Non"}</b></div>
            <div class="set ro"><Icon name="seed" /> <span>Graine</span><b class="num">{lobby.seed}</b></div>
            <div class="grow"></div>
            {#if !lobby.running}<p class="dim waiting"><span class="dot"></span> En attente du lancement par l'hôte</p>{/if}
          {/if}
        </aside>
      </div>

      <footer class="foot">
        <button class="icon-btn" onclick={copy}><Icon name={copied ? "check" : "link"} size={15} /> {copied ? "Lien copié" : "Copier le lien d'invitation"}</button>
        <button class="icon-btn" class:on={showReplays} onclick={loadReplays}><Icon name="replay" size={15} /> Replays</button>
        <span class="grow"></span>
        <span class="dim"><Icon name="user" size={13} /> {ui.name}</span>
      </footer>
      {#if showReplays}
        <div class="panel replays">
          {#each replays as r}
            <button class="icon-btn" onclick={() => client.loadReplay("/replays/" + r)}><Icon name="play" size={12} /> <span class="num">{r.replace("partie-", "").replace(".json", "")}</span></button>
          {:else}<span class="dim">Aucun replay pour l'instant.</span>{/each}
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .wrap { position: relative; z-index: 1; width: min(980px, calc(100vw - 32px)); display: flex; flex-direction: column; gap: 14px; padding: 24px 0; animation: rise 0.35s ease-out; }
  .cols { display: grid; grid-template-columns: 1fr 300px; gap: 14px; }
  .box { padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; }
  .notice { padding: 10px 14px; color: var(--warn); display: flex; gap: 8px; align-items: center; }
  .players { display: flex; flex-direction: column; gap: 6px; }
  .player {
    display: grid;
    grid-template-columns: 6px 1fr auto;
    gap: 12px;
    align-items: center;
    padding: 9px 10px 9px 0;
    background: linear-gradient(90deg, color-mix(in srgb, var(--pc) 16%, transparent), rgba(255, 255, 255, 0.015) 45%);
    border: 1px solid rgba(255, 255, 255, 0.05);
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%);
  }
  .player.me { border-color: rgba(62, 240, 255, 0.35); }
  .tag { align-self: stretch; background: var(--pc); box-shadow: 0 0 12px var(--pc); }
  .who { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .name { display: flex; align-items: center; gap: 7px; color: var(--text); }
  .name b { font-weight: 600; letter-spacing: 0.03em; }
  .badge { font-size: 9.5px; letter-spacing: 0.14em; text-transform: uppercase; padding: 1px 6px; border: 1px solid var(--line-hi); color: var(--accent); }
  .badge.you { border-color: var(--amber); color: var(--amber); }
  .badge.off { border-color: var(--bad); color: var(--bad); }
  .opts { display: flex; gap: 6px; flex-wrap: wrap; }
  .team { display: flex; align-items: center; gap: 6px; }
  .chip { display: inline-flex; gap: 5px; align-items: center; padding: 3px 8px; border: 1px solid var(--line); color: var(--dim); }
  .add { margin-top: 6px; padding-top: 10px; border-top: 1px dashed var(--line); display: flex; flex-direction: column; gap: 8px; }
  .addrow { display: flex; gap: 6px; flex-wrap: wrap; }
  .side { gap: 10px; }
  .set { display: grid; grid-template-columns: 18px 1fr auto; align-items: center; gap: 9px; padding: 7px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: var(--accent); }
  .set span { color: var(--text); }
  .set input[type="number"] { width: 110px; }
  .set.ro b { color: var(--text); font-weight: 600; }
  .grow { flex: 1; }
  .launch { padding: 12px; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .waiting { display: flex; align-items: center; gap: 8px; margin: 0; }
  .dot { width: 8px; height: 8px; background: var(--amber); box-shadow: 0 0 10px var(--amber); animation: blink 1.2s ease-in-out infinite; }
  .foot { display: flex; gap: 8px; align-items: center; }
  .replays { padding: 12px; display: flex; flex-wrap: wrap; gap: 6px; max-height: 200px; overflow: auto; }
  @keyframes rise { from { opacity: 0; transform: translateY(10px); } }
  @keyframes blink { 50% { opacity: 0.25; } }
  @media (max-width: 760px) {
    .cols { grid-template-columns: 1fr; }
    .player { grid-template-columns: 6px 1fr; }
    .team { grid-column: 2; }
  }
</style>
