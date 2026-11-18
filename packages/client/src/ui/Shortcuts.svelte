<script lang="ts">
  // Écran « Raccourcis » : liste des actions et de leurs touches, réassignation par appui,
  // avertissement en cas de conflit, réinitialisation. Enregistré dans le navigateur.
  import { onDestroy } from "svelte";
  import { kb, keymap, saveKeys } from "../game/keys.svelte.ts";
  import { ACTIONS, GROUPS, actionDef, isModifierCode, reservedReason, type Chord, type Conflict } from "../game/keymap.ts";
  import Icon from "./Icon.svelte";

  /** Touche en cours de saisie : action et position (= longueur de la liste pour ajouter). */
  let capture = $state<{ id: string; index: number } | null>(null);
  let error = $state("");

  const view = $derived.by(() => {
    void kb.version;
    const conflicts = keymap.conflicts();
    return {
      layout: keymap.layout,
      conflicts,
      count: conflicts.filter((c) => c.kind === "conflit").length,
      rows: ACTIONS.map((a) => ({ a, chords: keymap.get(a.id), isDefault: keymap.isDefault(a.id), conflicts: conflicts.filter((c) => c.a === a.id || c.b === a.id) })),
    };
  });
  const LAYOUT_NAME = { azerty: "AZERTY", qwerty: "QWERTY", autre: "autre disposition" };
  const SOURCE = { api: "détectée par le navigateur", langue: "devinée d'après la langue, ajustée à la frappe", défaut: "par défaut, ajustée à la frappe" };
  const name = (id: string) => actionDef(id)?.label.replace(/ \(Maj : ×5\)$/, "") ?? id;

  function note(id: string, c: Conflict): { text: string; warn: boolean } {
    const other = c.a === id ? c.b : c.a;
    const key = keymap.label(c.chord);
    if (c.kind === "conflit") return { text: `${key} : même touche que « ${name(other)} »`, warn: true };
    if (c.a === id) return { text: `${key} remplace « ${name(other)} » quand une usine est sélectionnée`, warn: false };
    return { text: `${key} sert à « ${name(other)} » quand une usine est sélectionnée`, warn: false };
  }

  function start(id: string, index: number) {
    capture = { id, index };
    error = "";
    kb.capturing = true;
  }
  function stop() {
    capture = null;
    kb.capturing = false;
  }
  function onKey(e: KeyboardEvent) {
    if (!capture) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code === "Escape") return stop();
    if (isModifierCode(e.code)) return;
    const def = actionDef(capture.id);
    const c: Chord = { code: e.code, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey && !def?.shiftFree };
    const why = reservedReason(c);
    if (why) {
      error = why;
      return;
    }
    keymap.assign(capture.id, capture.index, c);
    saveKeys();
    stop();
  }
  function remove(id: string, i: number) {
    keymap.remove(id, i);
    saveKeys();
  }
  function resetOne(id: string) {
    keymap.reset(id);
    saveKeys();
  }
  function resetAll() {
    stop();
    keymap.reset();
    saveKeys();
  }
  function close() {
    stop();
    kb.showKeys = false;
  }
  onDestroy(() => (kb.capturing = false));
</script>

<svelte:window onkeydowncapture={onKey} />

<div class="modal panel keys">
  <button class="close ghost icon-btn" onclick={close} title="Fermer (Échap)"><Icon name="close" /></button>
  <div class="modal-head">
    <Icon name="keyboard" size={26} />
    <div>
      <div class="kicker">Clavier</div>
      <h2>Raccourcis</h2>
    </div>
    <div class="grow"></div>
    <span class="dim small">Disposition : <b>{LAYOUT_NAME[view.layout.kind]}</b> ({SOURCE[view.layout.source]})</span>
    {#if view.count}<span class="warnc"><Icon name="alert" size={14} /> {view.count} conflit{view.count > 1 ? "s" : ""}</span>{/if}
    <button class="icon-btn" onclick={resetAll} title="Revenir aux touches par défaut de cette disposition"><Icon name="replay" size={14} /> Réinitialiser</button>
  </div>
  <div class="modal-body">
    <p class="dim intro">
      Cliquez sur « Modifier » (ou sur une touche) puis appuyez sur la nouvelle touche, avec Maj, Ctrl ou Alt si besoin ; Échap annule.
      Les chiffres restent réservés aux groupes de contrôle : chiffre = sélectionner, Maj+chiffre (ou Ctrl+chiffre) = créer.
    </p>
    {#if error}<p class="err"><Icon name="alert" size={14} /> {error}</p>{/if}
    <div class="cols">
      {#each GROUPS as g}
        <section>
          <h3>{g}</h3>
          {#each view.rows.filter((r) => r.a.group === g) as r (r.a.id)}
            {@const notes = r.conflicts.map((c) => note(r.a.id, c))}
            <div class="row" class:bad={notes.some((n) => n.warn)}>
              <span class="lbl">{r.a.label}</span>
              <span class="chords">
                {#each r.chords as c, i}
                  <span class="chip" class:cap={capture?.id === r.a.id && capture.index === i}>
                    <button class="ck num" onclick={() => start(r.a.id, i)} title="Modifier cette touche">{capture?.id === r.a.id && capture.index === i ? "Appuyez…" : keymap.label(c)}</button>
                    <button class="rm ghost" onclick={() => remove(r.a.id, i)} title="Retirer cette touche"><Icon name="close" size={10} /></button>
                  </span>
                {/each}
                {#if capture?.id === r.a.id && capture.index === r.chords.length}<span class="chip cap"><span class="ck num">Appuyez…</span></span>{/if}
                {#if !r.chords.length && !(capture?.id === r.a.id)}<span class="faint">—</span>{/if}
              </span>
              <span class="acts">
                <button class="mini" onclick={() => start(r.a.id, 0)}>Modifier</button>
                <button class="mini ghost" onclick={() => start(r.a.id, r.chords.length)} title="Ajouter une autre touche"><Icon name="plus" size={12} /></button>
                <button class="mini ghost" disabled={r.isDefault} onclick={() => resetOne(r.a.id)} title="Touche par défaut"><Icon name="replay" size={12} /></button>
              </span>
              {#each notes as n}<span class="note" class:warn={n.warn}>{#if n.warn}<Icon name="alert" size={12} />{/if} {n.text}</span>{/each}
            </div>
          {/each}
        </section>
      {/each}
    </div>
  </div>
</div>

<style>
  .keys { z-index: 26; }
  .modal-head :global(.ic) { color: var(--accent); }
  .modal-head { flex-wrap: wrap; align-items: center; }
  .intro { margin: 0 0 10px; max-width: 900px; }
  .err { color: var(--bad); display: flex; align-items: center; gap: 6px; margin: 0 0 8px; }
  .warnc { color: var(--amber); display: inline-flex; align-items: center; gap: 5px; }
  .cols { columns: 2 420px; column-gap: 28px; }
  section { break-inside: avoid; margin-bottom: 12px; }
  h3 { margin: 4px 0 6px; font-size: 13px; color: var(--accent); }
  .row { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 4px 10px; padding: 3px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.04); }
  .row.bad .lbl { color: var(--amber); }
  .lbl { min-width: 0; }
  .chords { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }
  .chip { display: inline-flex; align-items: stretch; }
  .chip button { padding: 1px 6px; font-size: 11px; }
  .ck { min-width: 30px; color: var(--accent); }
  .chip.cap .ck { color: var(--accent-ink); background: var(--amber); padding: 1px 6px; animation: blink 1s infinite; }
  .rm { padding: 1px 3px !important; color: var(--dim); }
  .acts { display: inline-flex; gap: 2px; }
  .mini { padding: 1px 7px; font-size: 11px; }
  .note { grid-column: 1 / -1; font-size: 11px; color: var(--dim); display: flex; align-items: center; gap: 5px; }
  .note.warn { color: var(--amber); }
  @keyframes blink { 50% { opacity: 0.55; } }
</style>
