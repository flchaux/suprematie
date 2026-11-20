<script lang="ts">
  import { ui } from "../game/state.svelte.ts";
  import { client } from "../game/client.ts";
  import { PLAYER_COLORS, PLAYER_COLOR_NAMES } from "../models/generator.ts";
  import Icon from "./Icon.svelte";
  import { sprite } from "./sprites.ts";
  import type { SaveMeta, Fauna } from "@supreme/shared";
  import { FAUNA_LEVELS, FAUNA_NAMES } from "@supreme/shared";
  const FAUNA_DESC: Record<Fauna, string> = {
    none: "Pas de nids sur la carte",
    peaceful: "Les bêtes ne se défendent que si on les attaque",
    normal: "Les nids attaquent en horde les joueurs qui s'étendent trop près",
    aggressive: "Nids plus grands, bêtes plus tôt évoluées, attaques plus fréquentes",
  };
  const FOG_DESC = "Désactivé : chacun voit toute la carte, unités et bâtiments ennemis compris, sans repérage";

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
    showSaves = false;
    if (showReplays) replays = await (await fetch("/api/replays")).json();
  }
  // sauvegardes : une partie chargée fixe la composition et les paramètres
  let saves = $state<SaveMeta[]>([]);
  let showSaves = $state(false);
  async function refreshSaves() {
    try {
      saves = await (await fetch("/api/saves")).json();
    } catch {
      saves = [];
    }
  }
  function toggleSaves() {
    showSaves = !showSaves;
    showReplays = false;
    if (showSaves) void refreshSaves();
  }
  function loadSave(id: string) {
    client.lobbyAction("loadSave", { id });
    showSaves = false;
  }
  function removeSave(m: SaveMeta) {
    if (!confirm(`Supprimer la sauvegarde « ${m.name} » ?`)) return;
    client.lobbyAction("deleteSave", { id: m.id });
    saves = saves.filter((x) => x.id !== m.id);
  }
  const loaded = $derived(lobby?.save ?? null);
  const editable = $derived(isHost && !!lobby && !lobby.running && !loaded);
  const missing = $derived(lobby && loaded ? lobby.players.filter((p) => !p.bot && !p.connected).length : 0);
  const fmtDate = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const minutes = (tick: number) => Math.floor(tick / 1200);
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
      {#if loaded && !lobby.running}
        <div class="panel loaded">
          <Icon name="save" size={18} />
          <div class="grow">
            <b>Reprise de partie</b> · {loaded.name}
            <div class="dim small">Sauvegardée le {fmtDate(loaded.savedAt)} · minute <span class="num">{minutes(loaded.tick)}</span> · composition, équipes et carte fixées par la sauvegarde</div>
          </div>
          {#if isHost}<button class="icon-btn" onclick={() => client.lobbyAction("unloadSave")}><Icon name="close" size={13} /> Annuler le chargement</button>{/if}
        </div>
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
                    {#if !p.connected && loaded && !lobby.running}<span class="badge free">Place libre</span>{:else if !p.connected}<span class="badge off">Déconnecté</span>{/if}
                    {#if p.savedName && p.savedName !== p.name && p.connected}<span class="dim small">(place de {p.savedName})</span>{/if}
                  </div>
                  {#if p.bot}
                    {#if editable}
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
                    {#if loaded && !lobby.running && !p.connected && p.slot !== ui.slot}
                      <div><button class="icon-btn" onclick={() => client.lobbyAction("claimSlot", { slot: p.slot })}><Icon name="user" size={13} /> Prendre cette place</button></div>
                    {/if}
                  {/if}
                </div>
                <div class="team">
                  {#if editable}
                    <select value={p.team} title="Équipe" onchange={(e) => client.lobbyAction("setTeam", { slot: p.slot, team: Number((e.target as HTMLSelectElement).value) })}>
                      {#each [0, 1, 2, 3, 4, 5, 6, 7] as t}<option value={t}>Équipe {t + 1}</option>{/each}
                    </select>
                  {:else}<span class="chip"><Icon name="team" size={13} /> Équipe {p.team + 1}</span>{/if}
                  {#if editable && p.bot}
                    <button class="ghost danger icon-btn" title="Retirer" onclick={() => client.lobbyAction("removeSlot", { slot: p.slot })}><Icon name="trash" size={15} /></button>
                  {/if}
                </div>
              </div>
            {/each}
            {#if editable && lobby.players.length < 8}
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
          {#if editable}
            <label class="set"><Icon name="map" /> <span>Carte</span>
              <select value={lobby.mapSize} onchange={(e) => client.lobbyAction("setMap", { mapSize: Number((e.target as HTMLSelectElement).value) })}>
                <option value={512}>10 km · 512 × 512</option>
                <option value={1024}>20 km · 1024 × 1024</option>
              </select></label>
            <label class="set"><Icon name="water" /> <span>Eau et îles</span><input type="checkbox" checked={lobby.water} onchange={(e) => client.lobbyAction("setMap", { water: (e.target as HTMLInputElement).checked })} /></label>
            <label class="set"><Icon name="seed" /> <span>Graine</span><input type="number" value={lobby.seed} onchange={(e) => client.lobbyAction("setMap", { seed: Number((e.target as HTMLInputElement).value) })} /></label>
            <label class="set" title={FAUNA_DESC[lobby.fauna ?? "none"]}><Icon name="fauna" /> <span>Faune</span>
              <select value={lobby.fauna ?? "none"} onchange={(e) => client.lobbyAction("setMap", { fauna: (e.target as HTMLSelectElement).value })}>
                {#each FAUNA_LEVELS as f}<option value={f}>{FAUNA_NAMES[f]}</option>{/each}
              </select></label>
            <p class="dim small fauna">{FAUNA_DESC[lobby.fauna ?? "none"]}</p>
            <label class="set" title={FOG_DESC}><Icon name="fog" /> <span>Brouillard de guerre</span><input type="checkbox" checked={lobby.fog ?? true} onchange={(e) => client.lobbyAction("setMap", { fog: (e.target as HTMLInputElement).checked })} /></label>
            {#if lobby.fog === false}<p class="dim small fauna">Toute la carte est visible en permanence par tous les joueurs</p>{/if}
            <div class="grow"></div>
            <button class="primary launch" onclick={() => client.lobbyAction("start")}><Icon name="play" size={15} /> Lancer la partie</button>
          {:else}
            <div class="set ro"><Icon name="map" /> <span>Carte</span><b>{lobby.mapSize === 1024 ? "20 km" : "10 km"}</b></div>
            <div class="set ro"><Icon name="water" /> <span>Eau</span><b>{lobby.water ? "Oui" : "Non"}</b></div>
            <div class="set ro"><Icon name="seed" /> <span>Graine</span><b class="num">{lobby.seed}</b></div>
            <div class="set ro" title={FAUNA_DESC[lobby.fauna ?? "none"]}><Icon name="fauna" /> <span>Faune</span><b>{FAUNA_NAMES[lobby.fauna ?? "none"]}</b></div>
            <div class="set ro" title={FOG_DESC}><Icon name="fog" /> <span>Brouillard de guerre</span><b>{lobby.fog === false ? "Non" : "Oui"}</b></div>
            <div class="grow"></div>
            {#if loaded && !lobby.running && missing > 0}
              <p class="dim waiting"><span class="dot"></span> En attente de {missing} joueur{missing > 1 ? "s" : ""} de la sauvegarde</p>
            {:else if !lobby.running && !isHost}
              <p class="dim waiting"><span class="dot"></span> En attente du lancement par l'hôte</p>
            {/if}
            {#if isHost && !lobby.running && loaded}
              <button class="primary launch" disabled={missing > 0} title={missing > 0 ? "Il faut autant de joueurs que dans la sauvegarde" : ""} onclick={() => client.lobbyAction("start")}><Icon name="play" size={15} /> Reprendre la partie</button>
            {/if}
          {/if}
        </aside>
      </div>

      <footer class="foot">
        <button class="icon-btn" onclick={copy}><Icon name={copied ? "check" : "link"} size={15} /> {copied ? "Lien copié" : "Copier le lien d'invitation"}</button>
        <button class="icon-btn" class:on={showReplays} onclick={loadReplays}><Icon name="replay" size={15} /> Replays</button>
        <button class="icon-btn" class:on={showSaves} onclick={toggleSaves}><Icon name="save" size={15} /> Sauvegardes</button>
        <span class="grow"></span>
        <span class="dim"><Icon name="user" size={13} /> {ui.name}</span>
      </footer>
      {#if showSaves}
        <div class="panel saves"><div class="in">
          {#each saves as m (m.id)}
            <div class="save" class:cur={loaded?.id === m.id}>
              <div class="grow">
                <b>{m.name}</b>
                <div class="dim small">{fmtDate(m.savedAt)} · minute <span class="num">{minutes(m.tick)}</span> · {m.mapSize === 1024 ? "20 km" : "10 km"}{m.water ? ", eau" : ""} · {m.players.map((p) => p.name).join(", ")} · {m.players.filter((p) => !p.bot).length} joueur{m.players.filter((p) => !p.bot).length > 1 ? "s" : ""}</div>
              </div>
              {#if isHost && !lobby.running}
                <button class="icon-btn" disabled={loaded?.id === m.id} onclick={() => loadSave(m.id)}><Icon name="upload" size={13} /> Charger</button>
                <button class="ghost danger icon-btn" title="Supprimer" disabled={loaded?.id === m.id} onclick={() => removeSave(m)}><Icon name="trash" size={14} /></button>
              {/if}
            </div>
          {:else}<span class="dim">Aucune sauvegarde. En partie : panneau Statistiques (Tab), bouton Sauvegarder ; une sauvegarde automatique est faite toutes les 5 minutes de jeu.</span>{/each}
          {#if !isHost && saves.length}<p class="dim small">Seul l'hôte peut charger une sauvegarde.</p>{/if}
        </div></div>
      {/if}
      {#if showReplays}
        <div class="panel replays"><div class="in">
          {#each replays as r}
            <button class="icon-btn" onclick={() => client.loadReplay("/replays/" + r)}><Icon name="play" size={12} /> <span class="num">{r.replace("partie-", "").replace(".json", "")}</span></button>
          {:else}<span class="dim">Aucun replay pour l'instant.</span>{/each}
        </div></div>
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
  .fauna { margin: 4px 0 0; line-height: 1.35; }
  .set.ro b { color: var(--text); font-weight: 600; }
  .grow { flex: 1; }
  .launch { padding: 12px; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .waiting { display: flex; align-items: center; gap: 8px; margin: 0; }
  .dot { width: 8px; height: 8px; background: var(--amber); box-shadow: 0 0 10px var(--amber); animation: blink 1.2s ease-in-out infinite; }
  .foot { display: flex; gap: 8px; align-items: center; }
  .loaded { padding: 10px 14px; display: flex; gap: 12px; align-items: center; border-color: var(--amber); color: var(--text); }
  .loaded :global(.ic) { color: var(--amber); }
  .badge.free { border-color: var(--amber); color: var(--amber); }
  .small { font-size: 11.5px; }
  /* le cadre ne défile pas (voir .modal) : seule la liste intérieure défile */
  .saves, .replays { padding: 12px; }
  .saves .in { display: flex; flex-direction: column; gap: 6px; max-height: 256px; overflow: auto; }
  .save { display: flex; gap: 8px; align-items: center; padding: 6px 8px; border: 1px solid rgba(255, 255, 255, 0.05); }
  .save.cur { border-color: var(--amber); }
  .side .launch:disabled { opacity: 0.45; filter: grayscale(0.8); cursor: not-allowed; box-shadow: none; }
  .replays .in { display: flex; flex-wrap: wrap; gap: 6px; max-height: 176px; overflow: auto; }
  @keyframes rise { from { opacity: 0; transform: translateY(10px); } }
  @keyframes blink { 50% { opacity: 0.25; } }
  @media (max-width: 760px) {
    .cols { grid-template-columns: 1fr; }
    .player { grid-template-columns: 6px 1fr; }
    .team { grid-column: 2; }
  }
</style>
