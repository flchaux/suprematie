<script lang="ts">
  import { ui } from "../game/state.svelte.ts";
  import Icon from "./Icon.svelte";
</script>

<div class="modal panel">
  <button class="close ghost icon-btn" onclick={() => (ui.showHelp = false)} title="Fermer (F1)"><Icon name="close" /></button>
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
        <li>Chaîne de base : <b>extracteur</b> sur un gisement → <b>tapis</b> → <b>bras</b> → <b>fonderie</b> → bras → tapis → <b>dépôt</b>.</li>
        <li>Un bras prend sur la case derrière lui et pose sur la case devant. Il ne prend que ce que la cible accepte.</li>
        <li>Tout bâtiment qui consomme de l'énergie doit être dans la zone d'un <b>pylône</b> ou d'un générateur relié au réseau.</li>
        <li>Les <b>assembleurs</b> ont besoin d'une recette (panneau de sélection). Les fonderies choisissent seules selon ce qu'elles reçoivent.</li>
        <li>Les <b>usines</b> reçoivent les composants des unités par des bras. Les <b>laboratoires</b> consomment les lots de recherche.</li>
        <li>Les épaves se recyclent en plaques de fer et en acier.</li>
      </ul>
    </div>
    <div>
      <h3>Commandes</h3>
      <table>
        <tbody>
          <tr><td>Clic gauche / glisser</td><td>Sélectionner / sélection par cadre (Maj : ajouter)</td></tr>
          <tr><td>Double-clic</td><td>Toutes les unités du même type à l'écran</td></tr>
          <tr><td>Clic droit</td><td>Déplacer, attaquer, assister, recycler, charger, ralliement (selon la cible)</td></tr>
          <tr><td>Maj + ordre</td><td>Mettre l'ordre en file</td></tr>
          <tr><td>Molette</td><td>Zoom continu (vue stratégique avec icônes de loin)</td></tr>
          <tr><td>Clic milieu glissé</td><td>Tourner / incliner la caméra</td></tr>
          <tr><td>Clic droit glissé, ZQSD, flèches, bords</td><td>Déplacer la caméra</td></tr>
          <tr><td>A / P / X / G / E / F / U</td><td>Attaque en mouvement, patrouille, arrêt, escorte, recycler, déployer, décharger</td></tr>
          <tr><td>B</td><td>Catégorie suivante de construction</td></tr>
          <tr><td>R</td><td>Tourner le bâtiment à poser</td></tr>
          <tr><td>Ctrl + 1-9 / 1-9</td><td>Créer / rappeler un groupe (deux fois : centrer)</td></tr>
          <tr><td>Ctrl + A</td><td>Toute l'armée visible</td></tr>
          <tr><td>C / Espace</td><td>Centrer sur le commandant / sur la dernière alerte</td></tr>
          <tr><td>T / Tab / Entrée</td><td>Recherche / statistiques / discussion</td></tr>
          <tr><td>Suppr</td><td>Annuler le chantier sélectionné</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>

<style>
  .modal-head :global(.ic) { color: var(--accent); }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
  h3 { margin: 12px 0 6px; font-size: 13px; color: var(--accent); }
  h3:first-child { margin-top: 0; }
  p { margin: 0 0 6px; }
  td { padding: 4px 12px 4px 0; vertical-align: top; border-bottom: 1px solid rgba(255, 255, 255, 0.04); }
  td:first-child { color: var(--accent); white-space: nowrap; font-family: var(--font-num); font-size: 11.5px; }
  ul { padding-left: 0; margin: 4px 0; list-style: none; }
  li { margin: 4px 0; padding-left: 16px; position: relative; }
  li::before { content: ""; position: absolute; left: 2px; top: 0.55em; width: 5px; height: 5px; background: var(--accent); transform: rotate(45deg); box-shadow: 0 0 6px var(--accent); }
  b { color: #fff; font-weight: 600; }
  @media (max-width: 1000px) { .two { grid-template-columns: 1fr; } }
</style>
