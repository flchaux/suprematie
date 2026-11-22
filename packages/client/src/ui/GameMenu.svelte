<script lang="ts">
  // Menu de partie (Échap) : reprendre, sauvegarder, charger, options, quitter vers le salon.
  import { ui } from "../game/state.svelte.ts";
  import { client } from "../game/client.ts";
  import { kb } from "../game/keys.svelte.ts";
  import { menuItems, type MenuId } from "../game/gameMenu.ts";
  import Icon from "./Icon.svelte";
  import Settings from "./Settings.svelte";

  const ICONS: Record<MenuId, string> = { resume: "play", save: "save", load: "download", options: "settings", quit: "exit" };
  const items = $derived(menuItems(client.menuRole()));
  let page = $state<"main" | "options">("main");
  let confirm = $state<MenuId | "">("");
  let saving = $state(0);
  const openedAt = performance.now();
  const saved = $derived(ui.lastSaved && ui.lastSaved.at > openedAt ? ui.lastSaved.name : "");

  function pick(id: MenuId) {
    const it = items.find((i) => i.id === id);
    if (!it?.enabled) return;
    if (it.confirm && confirm !== id) {
      confirm = id;
      return;
    }
    confirm = "";
    if (id === "resume") client.closeMenu();
    else if (id === "save") {
      saving = performance.now();
      client.saveGame();
    } else if (id === "load") client.quitToLobby(true);
    else if (id === "options") page = "options";
    else if (id === "quit") client.quitToLobby(false);
  }
</script>

<div class="backdrop" role="presentation">
  <div class="menu panel" role="dialog" aria-modal="true" aria-label="Menu de la partie">
    {#if page === "options"}
      <Settings onkeys={() => { client.closeMenu(); kb.showKeys = true; }} />
      <button class="back icon-btn" onclick={() => (page = "main")}><Icon name="replay" size={14} /> Retour au menu</button>
    {:else}
      <div class="head">
        <div class="kicker">{ui.replay ? "Replay" : ui.ended ? "Partie terminée" : "Partie"}</div>
        <div class="state" class:paused={client.paused()}>
          {#if client.paused()}<Icon name="pause" size={14} /> En pause{#if ui.pausedBy && !ui.replay}<span class="dim"> · par {ui.pausedBy}</span>{/if}
          {:else if !ui.ended}<Icon name="play" size={14} /> La partie continue{#if !ui.replay}<span class="dim"> · seul l'hôte peut la mettre en pause</span>{/if}{/if}
        </div>
      </div>
      <div class="items">
        {#each items as it (it.id)}
          <button class="item" class:primary={it.id === "resume"} class:warn={confirm === it.id} disabled={!it.enabled} title={it.hint} onclick={() => pick(it.id)} onmouseleave={() => confirm === it.id && (confirm = "")}>
            <Icon name={ICONS[it.id]} size={16} />
            <span class="lbl">{confirm === it.id ? "Confirmer : " + it.label.toLowerCase() : it.label}</span>
            {#if it.id === "resume"}<span class="key">Échap</span>{/if}
          </button>
          {#if confirm === it.id || (!it.enabled && it.id !== "save")}<div class="hint" class:warn={confirm === it.id}>{it.hint}</div>{/if}
          {#if it.id === "save" && saving}<div class="hint good">{saved ? "Sauvegardée : " + saved : "Sauvegarde en cours…"}</div>{/if}
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .backdrop { position: absolute; inset: 0; z-index: 60; display: grid; place-items: center; background: rgba(4, 8, 14, 0.55); backdrop-filter: blur(2px); animation: fade 0.12s ease-out; }
  .menu { width: 330px; padding: 18px 20px; display: flex; flex-direction: column; gap: 12px; animation: drop 0.14s ease-out; }
  .head { display: flex; flex-direction: column; gap: 4px; }
  .state { display: flex; align-items: center; gap: 7px; font-size: 13px; color: var(--accent); }
  .state.paused { color: var(--amber); letter-spacing: 0.06em; }
  .items { display: flex; flex-direction: column; gap: 6px; }
  .item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; font-size: 14px; justify-content: flex-start; }
  .item .lbl { flex: 1; text-align: left; }
  .item :global(.ic) { color: var(--accent); }
  .item.primary :global(.ic) { color: inherit; }
  .item.primary .key { color: inherit; border-color: currentColor; background: transparent; opacity: 0.75; }
  .item.warn { --b-line: var(--bad); color: var(--bad); }
  .item.warn :global(.ic) { color: var(--bad); }
  .item:disabled :global(.ic) { color: var(--dim); }
  .hint { font-size: 11.5px; color: var(--dim); margin: -2px 2px 2px; }
  .hint.warn { color: var(--warn); }
  .hint.good { color: var(--good, var(--accent)); }
  .back { align-self: flex-start; gap: 7px; }
  @keyframes fade { from { opacity: 0; } }
  @keyframes drop { from { opacity: 0; transform: translateY(-6px); } }
</style>
