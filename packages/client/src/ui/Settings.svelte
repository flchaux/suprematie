<script lang="ts">
  // Réglages du joueur (sons, vue stratégique, graphismes, clavier), enregistrés dans le navigateur :
  // panneau de la barre du haut et page « Options » du menu de partie.
  import { ui } from "../game/state.svelte.ts";
  import { client } from "../game/client.ts";
  import Icon from "./Icon.svelte";
  import { keyOf } from "../game/keys.svelte.ts";
  let { onkeys }: { onkeys: () => void } = $props();
</script>

<div class="settings">
  <div class="kicker">Réglages</div>
  <label class="row"><Icon name="volume" /> <span>Effets sonores</span><input type="range" min="0" max="1" step="0.05" value={ui.volume} oninput={(e) => client.setVolume(Number((e.target as HTMLInputElement).value))} /></label>
  <label class="row"><Icon name="volume" /> <span>Annonces vocales</span><input type="checkbox" checked={ui.voice} onchange={(e) => client.setVoice((e.target as HTMLInputElement).checked)} /></label>
  <label class="row"><Icon name="music" /> <span>Musique</span><input type="range" min="0" max="1" step="0.05" value={ui.music} oninput={(e) => client.setMusicVolume(Number((e.target as HTMLInputElement).value))} /></label>
  <label class="row" title="Distance de la caméra à partir de laquelle les unités deviennent des icônes"><Icon name="icons" /> <span>Vue stratégique</span><input type="range" min="80" max="600" step="10" value={client.iconDistance()} oninput={(e) => client.setIconDistance(Number((e.target as HTMLInputElement).value))} /></label>
  <div class="kicker sub">Graphismes</div>
  <label class="row"><Icon name="eye" /> <span>Ombres portées</span><input type="checkbox" checked={ui.gfx.shadows} onchange={(e) => client.setGfx({ shadows: (e.target as HTMLInputElement).checked })} /></label>
  <label class="row"><Icon name="factory" /> <span>Textures des modèles</span><input type="checkbox" checked={ui.gfx.textures} onchange={(e) => client.setGfx({ textures: (e.target as HTMLInputElement).checked })} /></label>
  <label class="row" title="Textures du sol mélangées selon l'altitude et la pente"><Icon name="map" /> <span>Détails du sol</span><input type="checkbox" checked={ui.gfx.ground} onchange={(e) => client.setGfx({ ground: (e.target as HTMLInputElement).checked })} /></label>
  <label class="row" title="Herbes, buissons, arbres, rochers et débris sur le sol"><Icon name="seed" /> <span>Décorations</span><input type="checkbox" checked={ui.gfx.decor} onchange={(e) => client.setGfx({ decor: (e.target as HTMLInputElement).checked })} /></label>
  <label class="row" title="Bulles de bouclier à alvéoles hexagonales, bord lumineux et ondulation (sinon une simple bulle translucide)"><Icon name="assist" /> <span>Boucliers détaillés</span><input type="checkbox" checked={ui.gfx.shieldFx !== false} onchange={(e) => client.setGfx({ shieldFx: (e.target as HTMLInputElement).checked })} /></label>
  <label class="row" title="Portées de tir (orange : sol, bleu : air, turquoise : sous-marins, rouge : trop près), et du radar (vert) des unités et bâtiments sélectionnés"><Icon name="target" /> <span>Cercles de portée</span><input type="checkbox" checked={ui.gfx.ranges} onchange={(e) => client.setGfx({ ranges: (e.target as HTMLInputElement).checked })} /></label>
  <label class="row"><Icon name="special" /> <span>Halo lumineux</span><input type="checkbox" checked={ui.gfx.bloom} onchange={(e) => client.setGfx({ bloom: (e.target as HTMLInputElement).checked })} /></label>
  <label class="row"><Icon name="target" /> <span>Effets de combat</span>
    <select value={String(ui.gfx.effects)} onchange={(e) => client.setGfx({ effects: Number((e.target as HTMLSelectElement).value) })}>
      <option value="1">Complets</option>
      <option value="0.4">Réduits</option>
    </select>
  </label>
  <div class="kicker sub">Clavier</div>
  <button class="icon-btn kbtn" onclick={onkeys}><Icon name="keyboard" /> Raccourcis clavier…</button>
  {#if keyOf("perf")}<p class="dim small"><span class="key">{keyOf("perf")}</span> détail des performances</p>{/if}
</div>

<style>
  .settings { display: flex; flex-direction: column; gap: 8px; }
  .row { display: grid; grid-template-columns: 18px 1fr auto; align-items: center; gap: 9px; color: var(--accent); }
  .row span { color: var(--text); }
  input[type="range"] { width: 100px; }
  .sub { margin-top: 6px; }
  p { margin: 4px 0 0; }
  .kbtn { justify-content: flex-start; gap: 9px; }
  .kbtn :global(.ic) { color: var(--accent); }
</style>
