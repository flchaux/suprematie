<script lang="ts">
  // Bibliothèque de plans : liste (actif, renommer, supprimer), export et import par une chaîne de texte.
  import { ui } from "../game/state.svelte.ts";
  import { client } from "../game/client.ts";
  import { plans, renamePlan, removePlan, setActive, exportText, importText } from "../game/plans.svelte.ts";
  import { planSize, type Plan } from "../game/blueprint.ts";
  import { keyOf } from "../game/keys.svelte.ts";
  import Icon from "./Icon.svelte";

  let editing = $state("");
  let editName = $state("");
  let confirmDel = $state("");
  let exporting = $state("");
  let exportStr = $state("");
  let copied = $state(false);
  let importing = $state(false);
  let importStr = $state("");
  let importErr = $state("");

  const kCopy = $derived(keyOf("copyPlan"));
  const kPaste = $derived(keyOf("pastePlan"));
  const kLib = $derived(keyOf("planLibrary"));

  function size(p: Plan): string {
    if (!ui.data) return "";
    const s = planSize(ui.data, p.parts);
    return `${s.w}×${s.h}`;
  }
  function contents(p: Plan): string {
    if (!ui.data) return "";
    const n = new Map<string, number>();
    for (const x of p.parts) n.set(x.key, (n.get(x.key) ?? 0) + 1);
    const name = (k: string) => ui.data!.buildings.find((b) => b.key === k)?.name ?? k;
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([k, c]) => `${c} × ${name(k)}`).join("\n");
  }
  function startRename(p: Plan) {
    editing = p.id;
    editName = p.name;
  }
  function commitRename() {
    if (editing) renamePlan(editing, editName);
    editing = "";
  }
  function toggleExport(p: Plan) {
    importing = false;
    copied = false;
    if (exporting === p.id) {
      exporting = "";
      return;
    }
    exporting = p.id;
    exportStr = exportText(p.id);
  }
  async function copyExport() {
    try {
      await navigator.clipboard.writeText(exportStr);
      copied = true;
    } catch {
      copied = false; // presse-papiers refusé : le texte reste sélectionnable
    }
  }
  function doImport() {
    const err = importText(importStr);
    importErr = err ?? "";
    if (!err) {
      importStr = "";
      importing = false;
    }
  }
  function del(p: Plan) {
    if (confirmDel !== p.id) {
      confirmDel = p.id;
      return;
    }
    removePlan(p.id);
    confirmDel = "";
    if (exporting === p.id) exporting = "";
  }
  function paste(p: Plan) {
    setActive(p.id);
    client.plans.startPaste(p.id);
  }
  const selectAll = (e: Event) => (e.target as HTMLTextAreaElement).select();
</script>

<div class="plans panel">
  <div class="head">
    <Icon name="blueprint" size={20} />
    <div class="grow">
      <div class="kicker">Bibliothèque</div>
      <h3>Plans</h3>
    </div>
    <button class="ghost icon-btn" onclick={() => (plans.show = false)} title={kLib ? `Fermer (${kLib})` : "Fermer"}><Icon name="close" size={14} /></button>
  </div>
  <div class="row">
    <button class="icon-btn" disabled={ui.me < 0} onclick={() => client.plans.startCopy()} title="Glisser un cadre sur vos bâtiments terminés"><Icon name="copy" size={14} /> Copier une zone {#if kCopy}<span class="key">{kCopy}</span>{/if}</button>
    <button class="icon-btn" class:on={importing} onclick={() => ((importing = !importing), (exporting = ""), (importErr = ""))}><Icon name="upload" size={14} /> Importer</button>
  </div>
  {#if importing}
    <div class="box">
      <textarea rows="3" bind:value={importStr} placeholder="Collez ici le texte d'un plan (SUPREME-PLAN-1:…)"></textarea>
      {#if importErr}<div class="bad small">{importErr}</div>{/if}
      <div class="row"><button class="icon-btn" disabled={!importStr.trim()} onclick={doImport}><Icon name="check" size={14} /> Ajouter à la bibliothèque</button></div>
    </div>
  {/if}
  <div class="list">
    {#each plans.list as p (p.id)}
      <div class="item" class:active={p.id === plans.active}>
        <button class="pick ghost" title={p.id === plans.active ? "Plan actif" : "Rendre ce plan actif"} onclick={() => setActive(p.id)}><span class="dot"></span></button>
        <div class="main" title={contents(p)}>
          {#if editing === p.id}
            <!-- svelte-ignore a11y_autofocus -->
            <input class="name-in" bind:value={editName} autofocus maxlength="60" onkeydown={(e) => (e.key === "Enter" ? commitRename() : e.key === "Escape" ? (editing = "") : null)} onblur={commitRename} />
          {:else}
            <span class="name">{p.name}</span>
          {/if}
          <span class="meta num">{p.parts.length} bât. · {size(p)}</span>
        </div>
        <div class="acts">
          <button class="ghost icon-btn" disabled={!ui.canBuild} title={ui.canBuild ? `Coller${kPaste ? ` (${kPaste})` : ""}` : "Sélectionnez un ingénieur pour coller"} onclick={() => paste(p)}><Icon name="paste" size={14} /></button>
          <button class="ghost icon-btn" title="Renommer" onclick={() => startRename(p)}><Icon name="edit" size={14} /></button>
          <button class="ghost icon-btn" class:on={exporting === p.id} title="Exporter (texte à partager)" onclick={() => toggleExport(p)}><Icon name="save" size={14} /></button>
          <button class="ghost icon-btn danger" class:confirm={confirmDel === p.id} title={confirmDel === p.id ? "Cliquer encore pour supprimer" : "Supprimer"} onclick={() => del(p)} onmouseleave={() => confirmDel === p.id && (confirmDel = "")}><Icon name="trash" size={14} />{#if confirmDel === p.id}<span class="small">Supprimer ?</span>{/if}</button>
        </div>
      </div>
      {#if exporting === p.id}
        <div class="box">
          <textarea rows="3" readonly value={exportStr} onfocus={selectAll}></textarea>
          <div class="row"><button class="icon-btn" onclick={copyExport}><Icon name="copy" size={14} /> Copier le texte</button>{#if copied}<span class="good small">Copié dans le presse-papiers</span>{/if}</div>
        </div>
      {/if}
    {:else}
      <p class="dim small empty">Aucun plan. Sélectionnez un ingénieur, {kCopy || "Copier"}, puis glissez un cadre sur vos bâtiments terminés. Le plan copié devient actif : {kPaste || "Coller"} le pose ailleurs.</p>
    {/each}
  </div>
</div>

<style>
  .plans { position: absolute; top: 104px; right: 10px; width: 330px; max-height: calc(100vh - 380px); display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; z-index: 15; }
  .head { display: flex; align-items: center; gap: 10px; color: var(--accent); }
  .head h3 { margin: 0; font-size: 15px; color: var(--text); }
  .grow { flex: 1; }
  .row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .box { display: flex; flex-direction: column; gap: 6px; }
  textarea { width: 100%; resize: vertical; font-family: var(--font-num); font-size: 11px; word-break: break-all; }
  .list { overflow: auto; display: flex; flex-direction: column; gap: 3px; min-height: 0; }
  .item { display: flex; align-items: center; gap: 6px; padding: 3px 4px; border-left: 2px solid transparent; }
  .item:hover { background: rgba(62, 240, 255, 0.04); }
  .item.active { border-left-color: var(--amber); background: rgba(255, 181, 71, 0.06); }
  .pick { padding: 4px; }
  .dot { display: block; width: 9px; height: 9px; border: 1px solid var(--line-hi); transform: rotate(45deg); }
  .active .dot { background: var(--amber); border-color: var(--amber); box-shadow: 0 0 6px rgba(255, 181, 71, 0.7); }
  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .name-in { padding: 2px 5px; width: 100%; }
  .meta { font-size: 10.5px; color: var(--dim); }
  .acts { display: flex; gap: 0; }
  .acts .icon-btn { padding: 4px 5px; }
  .confirm { color: var(--bad); }
  .empty { margin: 4px 2px; line-height: 1.5; }
</style>
