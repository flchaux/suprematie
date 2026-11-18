<script lang="ts">
  import { ui } from "../game/state.svelte.ts";
  import { kb, keymap, keyOf } from "../game/keys.svelte.ts";
  import { helpRows, GROUPS } from "../game/keymap.ts";
  import Icon from "./Icon.svelte";

  // raccourcis lus dans le module (ils suivent la disposition du clavier et la personnalisation)
  const rows = $derived.by(() => {
    void kb.version;
    return helpRows(keymap);
  });
  const helpKey = $derived(keyOf("help"));
  function customize() {
    ui.showHelp = false;
    kb.showKeys = true;
  }
</script>

<div class="modal panel">
  <button class="close ghost icon-btn" onclick={() => (ui.showHelp = false)} title={helpKey ? `Fermer (${helpKey})` : "Fermer"}><Icon name="close" /></button>
  <div class="modal-head">
    <Icon name="help" size={26} />
    <div>
      <div class="kicker">Manuel du commandant</div>
      <h2>Aide</h2>
    </div>
  </div>
  <div class="two">
    <div>
      <h3>But</h3>
      <p>Détruire le robot de commandement de chaque adversaire. Quand il est détruit, il explose et son joueur est éliminé. La dernière équipe qui a encore un robot de commandement gagne.</p>
      <h3>Économie</h3>
      <ul>
        <li>Les ingénieurs (et le robot de commandement) construisent avec le <b>stock commun</b>, affiché en haut.</li>
        <li>Le stock se remplit uniquement par les <b>dépôts</b> : tout objet qui y entre (par tapis ou bras) devient disponible partout.</li>
        <li>Chaîne de base : <b>extracteur</b> sur un gisement → <b>tapis</b> → <b>fonderie</b> → tapis → <b>dépôt</b>.</li>
        <li><b>Dépôts et réserve</b> : votre réserve garde au plus 400 de chaque objet, plus 600 par dépôt (2 000 pour un dépôt amélioré). Réserve pleine : les dépôts refusent l'objet et les tapis attendent. Un dépôt amélioré (automatisation) gagne un étage et des sorties filtrées, réglées dans sa fiche : il pose ces objets, pris dans la réserve, sur les tapis qui partent de lui.</li>
        <li><b>Collecteur de surplus</b> (automatisation) : posé sur un tapis, qu'il remplace ; quand la file est bouchée plus loin, ce qui arrive sous lui part dans votre stock, et l'amont ne s'arrête jamais.</li>
        <li><b>Trappes</b> : un tapis qui entre dans un bâtiment le livre directement (trappe cyan) ; un tapis qui part d'une face reçoit ses produits (trappe ambre). Sans tapis, la trappe reste fermée.</li>
        <li>Les <b>bras</b> restent utiles pour prendre sur un tapis qui passe le long d'un bâtiment : un bras prend sur la case derrière lui et pose sur la case devant, seulement ce que la cible accepte. Quand un bâtiment a plusieurs sorties (bras et tapis), elles reçoivent ses produits à tour de rôle ; la part d'un bras se règle en le sélectionnant.</li>
        <li>Tout bâtiment qui consomme de l'énergie doit être dans la zone d'un <b>pylône</b> ou d'un générateur relié au réseau.</li>
        <li>Les <b>assembleurs</b> ont besoin d'une recette (panneau de sélection). Les fonderies choisissent seules selon ce qu'elles reçoivent.</li>
        <li>Les <b>usines</b> reçoivent les composants des unités par des bras. Les <b>laboratoires</b> consomment les lots de recherche.</li>
        <li>Les épaves se recyclent en plaques de fer et en acier.</li>
      </ul>
      <h3>Souris</h3>
      <table>
        <tbody>
          <tr><td>Clic gauche / glisser</td><td>Sélectionner / sélection par cadre (Maj : ajouter)</td></tr>
          <tr><td>Double-clic</td><td>Toutes les unités du même type à l'écran</td></tr>
          <tr><td>Clic droit</td><td>Déplacer, attaquer, assister, recycler, charger, ralliement (selon la cible)</td></tr>
          <tr><td>Maj + ordre</td><td>Mettre l'ordre en file</td></tr>
          <tr><td>Molette</td><td>Zoom continu (vue stratégique avec icônes de loin)</td></tr>
          <tr><td>J maintenu</td><td>Vue logistique : remplissage de chaque tapis (vide, fluide, chargé, saturé) et bâtiments bloqués, affamés ou sans énergie</td></tr>
          <tr><td>Molette (pose de tapis)</td><td>Niveau du tapis : sol, étage 1 ou étage 2. Un tapis surélevé passe au-dessus des tapis et des bâtiments ; entre deux niveaux, un ascenseur se forme tout seul. Un tapis ne livre un bâtiment qu'au sol.</td></tr>
          <tr><td>Clic milieu glissé</td><td>Tourner / incliner la caméra</td></tr>
          <tr><td>Clic droit glissé (unités sélectionnées)</td><td>Formation orientée : les unités se placent en lignes autour du point cliqué, face à la direction du glisser (Maj : en file)</td></tr>
          <tr><td>Clic droit glissé (sans unité), bords</td><td>Déplacer la caméra</td></tr>
        </tbody>
      </table>
    </div>
    <div>
      <div class="kh">
        <h3>Clavier</h3>
        <button class="icon-btn" onclick={customize}><Icon name="settings" size={14} /> Personnaliser les raccourcis</button>
      </div>
      <table class="keys">
        {#each GROUPS as g}
          {@const list = rows.filter((r) => r.group === g)}
          {#if list.length}
            <tbody>
              <tr class="gh"><th colspan="2">{g}</th></tr>
              {#each list as r}<tr><td>{r.keys}</td><td>{r.label}</td></tr>{/each}
            </tbody>
          {/if}
        {/each}
      </table>
    </div>
  </div>
</div>

<style>
  .modal-head :global(.ic) { color: var(--accent); }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
  h3 { margin: 12px 0 6px; font-size: 13px; color: var(--accent); }
  h3:first-child { margin-top: 0; }
  .kh { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 4px; }
  .kh h3 { margin: 0; }
  p { margin: 0 0 6px; }
  td { padding: 4px 12px 4px 0; vertical-align: top; border-bottom: 1px solid rgba(255, 255, 255, 0.04); }
  td:first-child { color: var(--accent); white-space: nowrap; font-family: var(--font-num); font-size: 11.5px; }
  .keys td:first-child { white-space: normal; min-width: 110px; max-width: 200px; }
  .gh th { padding: 10px 0 3px; }
  ul { padding-left: 0; margin: 4px 0; list-style: none; }
  li { margin: 4px 0; padding-left: 16px; position: relative; }
  li::before { content: ""; position: absolute; left: 2px; top: 0.55em; width: 5px; height: 5px; background: var(--accent); transform: rotate(45deg); box-shadow: 0 0 6px var(--accent); }
  b { color: #fff; font-weight: 600; }
  @media (max-width: 1000px) { .two { grid-template-columns: 1fr; } }
</style>
