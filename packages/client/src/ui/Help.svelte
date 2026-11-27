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
  <div class="modal-body">
    <div class="two">
      <div>
        <h3>But</h3>
        <p>Détruire l'unité de commandement de chaque adversaire (robot de commandement, Reine ou Arche). Quand elle est détruite, son joueur est éliminé. La dernière équipe qui en a encore une gagne.</p>
        <h3>Économie</h3>
        <ul>
          <li>Il n'y a pas de réserve commune : chaque <b>dépôt</b> garde son propre stock (affiché dans sa fiche ; le total de vos dépôts est en haut). Vous commencez sans dépôt : les ressources de départ sont dans la soute du robot de commandement, qui compte comme un dépôt (le total du haut l'inclut).</li>
          <li><b>Drones</b> : le robot de commandement, les ingénieurs et les usines ont des drones qui vont chercher en vol, dans les dépôts proches (25 à 45 cases selon le constructeur, 30 pour une usine), ce que demande toute leur file de chantiers, pas seulement le chantier en cours. Ce qu'ils ont déjà sur eux ne se redemande pas, et un ordre annulé renvoie ces ressources au dépôt le plus proche. La soute du robot de commandement compte comme un dépôt : vous commencez sans dépôt, avec les ressources de départ dans sa soute, où puisent aussi les drones des ingénieurs et des usines à portée. Un ingénieur qui part construire loin de tout dépôt emporte d'abord les matériaux dans sa soute. La fiche d'un chantier montre ce qui manque et ce qui est à portée.</li>
          <li>Chaîne de base : <b>extracteur</b> sur un gisement → <b>tapis</b> → <b>fonderie</b> → tapis → <b>dépôt</b>.</li>
          <li><b>Dépôts</b> : un dépôt garde au plus 600 de chaque objet (2 000 une fois amélioré) ; plein, il refuse l'objet et le tapis attend. Ses sorties sont actives : il pose ses objets sur les tapis qui partent de lui et les bras peuvent les y prendre ; des filtres, dans sa fiche, limitent ce qui sort. Les générateurs vont aussi chercher leur combustible dans les dépôts proches (30 cases), avec un drone.</li>
          <li><b>Débordement</b> (logistique rapide) : il envoie tout devant et, seulement quand l'avant est bloqué, à gauche puis à droite. Une ligne prioritaire reste servie et seul le surplus part ailleurs, vers un dépôt par exemple.</li>
          <li><b>Trappes</b> : un tapis qui entre dans un bâtiment le livre directement (trappe cyan) ; un tapis qui part d'une face reçoit ses produits (trappe ambre). Sans tapis, la trappe reste fermée.</li>
          <li>Les <b>bras</b> restent utiles pour prendre sur un tapis qui passe le long d'un bâtiment : un bras prend sur la case derrière lui et pose sur la case devant, seulement ce que la cible accepte. Quand un bâtiment a plusieurs sorties (bras et tapis), elles reçoivent ses produits à tour de rôle ; la part d'un bras se règle en le sélectionnant.</li>
          <li><b>Électricité</b> : vous démarrez avec un <b>générateur principal</b> (grande zone) et 20 hydrocarbures. Chaque générateur brûle de l'<b>hydrocarbure</b> (ou du carburant, 5 fois plus efficace), d'autant plus vite que sa zone consomme ; sans combustible, il ne produit rien. Un extracteur sur un gisement d'hydrocarbure fonctionne <b>sans électricité</b> : collé à un générateur, il le remplit directement ; un dépôt collé l'alimente aussi depuis son stock, et son drone va chercher du combustible dans les dépôts à moins de 30 cases quand le réservoir est à moitié vide.</li>
          <li>Un bâtiment qui consomme doit être dans une zone : celle d'un générateur, étendue par des <b>relais</b> (petite zone). Un nouveau générateur crée une nouvelle zone ; des zones qui se touchent ou que des relais relient n'en forment qu'une. Un générateur <b>à sec perd sa zone</b> et ne relie plus ses voisins : deux zones reliées par lui se retrouvent isolées.</li>
          <li>Les <b>tapis consomment</b> eux aussi : une file s'arrête entièrement si l'une de ses cases est hors zone ou dans une zone éteinte (une zone seulement sous-alimentée ne les arrête pas). Entre deux zones éloignées, passez par un train (ou des relais) : les <b>gares et héliports n'ont pas besoin d'électricité</b>. Un tapis ou un bras qui <b>transporte du combustible</b> est alimenté par lui : il ne s'arrête jamais (un générateur nourri par tapis repart donc seul après une panne).</li>
          <li><b>Vue électrique</b> (maintenir K) : une couleur par réseau, zones mortes hachurées de rouge, liaisons entre générateurs et relais, et pour chaque réseau sa consommation, sa production et son autonomie. Les zones s'affichent aussi pendant la pose d'un bâtiment électrique ; la mini-carte les montre toujours, avec un point par générateur (vert, ambre sous une minute d'autonomie, rouge à sec).</li>
          <li>Les <b>assembleurs</b> ont besoin d'une recette (panneau de sélection). Les fonderies choisissent seules selon ce qu'elles reçoivent.</li>
          <li>Les <b>usines</b> reçoivent les composants des unités par des bras. Les <b>laboratoires</b> consomment les lots de recherche.</li>
          <li>Les épaves se recyclent en plaques de fer et en acier.</li>
          <li><b>Récolte du commandant</b> : sa fonderie intégrée lui permet de récolter un gisement libre de fer, de cuivre ou de silicium (clic droit dessus, ou touche M puis clic). Il extrait le minerai et le fond lui-même : une plaque toutes les 4 s (plaquette de silicium : 6 s, après l'électronique), mise dans sa soute, qui compte comme un dépôt (600 par objet). C'est deux fois moins qu'un extracteur et une fonderie de base : un dépannage, pas une usine. Un ennemi à portée de son canon met la récolte en pause ; un nouvel ordre l'arrête.</li>
        </ul>
        {#if ui.race === 2}
          <h3>Transhumants</h3>
          <ul>
            <li><b>Améliorations</b> : sélectionnez l'<b>Arche</b> seule. Elle a cinq emplacements (armement, coque, pont, mobilité, soutien) ; chacun ne garde qu'une branche. Une amélioration coûte des composants (soute de l'Arche, réserves et soutes repliées à moins de 30 cases) et des relevés, et s'installe en 25 à 90 s, même en roulant ; l'annuler rend tout, la remplacer par une autre branche rend la moitié des composants.</li>
            <li><b>Amphibie</b> : l'Arche, ses remorques, les chenillards, les chariots et toutes vos unités traversent l'eau. Un module ne se déploie que sur la terre ; sur l'eau, vos unités craignent les torpilles.</li>
            <li><b>Réseau</b> : les bâtiments qui se touchent par un côté (poteaux et bastion compris) se passent tous les objets, de proche en proche, comme s'ils étaient collés : une file de modules ou de poteaux relie une foreuse à une fonderie éloignée. Une passerelle en métal marque chaque jonction ; la fiche donne la taille du réseau.</li>
            <li><b>Soute</b> : elle alimente les fabricants de son réseau. Les ateliers passent avant : elle garde pour eux ce qui manque à leur prochaine unité. Dès qu'elle a 100 exemplaires d'un produit, elle garde aussi les 40 derniers de ses ingrédients. Une fonderie « Automatique » reliée à une soute fond son minerai le plus abondant.</li>
            <li><b>Chariots</b> (six par soute, payés par elle puis par les réserves à moins de 30 cases), pour les modules hors du réseau : clic droit sur un module pour lui porter ce qu'il demande (si la soute l'a) et rapporter sa production, Maj+clic droit sur un fabricant pour le ravitailler, clic droit sur une autre soute pour lui porter ce que la leur a de plus. Ils reprennent leur navette quand leur soute est repliée puis redéployée.</li>
            <li><b>Convoi</b> : des chenillards repliés sélectionnés, clic droit sur l'Arche ou « Atteler à l'Arche » (touche {keyOf("tow") || "Atteler"}) : ils rejoignent la queue du convoi et s'y accrochent, derrière les remorques, et passent partout où l'Arche passe. Neuf au plus ; chacun ralentit l'Arche de 3 %. Un ordre de déplacement, « Déployer » ou « Dételer » en détache un ; ceux qui le suivaient remontent. L'Arche embarquée dans un transport les dételle tous.</li>
            <li><b>Atelier perdu</b> : l'Arche peut toujours refaire un chenillard atelier, cinq fois plus lentement qu'un atelier, payé dans sa soute et les réserves à moins de 30 cases.</li>
            <li>Chaque <b>module</b> a deux emplacements (rendement, spécialité), chaque <b>unité de combat</b> trois (arme, châssis, équipement) et chaque chariot un, dans leur fiche ; un module garde les siens quand il se replie et se redéploie. Plusieurs unités du même type se sélectionnent et s'équipent ensemble, ou sortent de l'atelier selon un gabarit.</li>
            <li><b>Mâtin</b> : en marche offensive, en patrouille ou en escorte, il court sus à ce qui approche ; chaque autre Mâtin à moins de 6 cases renforce ses coups. <b>Berger</b> : toutes vos unités à moins de 12 cases vont plus vite ; avec un chenil, il élève ses Mâtins en marchant.</li>
            <li><b>Armée de l'atelier</b> : peu d'unités, chères et longues à produire, mais chacune vaut plus qu'une unité ordinaire du même prix.</li>
            <li><b>Chariot bouclier</b> (Projecteurs de convoi) : sa bulle arrête les tirs ennemis venus du dehors ; gardez le convoi dedans. Il s'améliore dans sa fiche : émetteur (rayon, ou bulle réfléchissante qui renvoie une part des coups), accumulateurs (points), régénérateurs (recharge).</li>
            <li><b>Tourelles</b> (pont) : 1, 3 puis 9. « Déployer » (touche {keyOf("deploy") || "Déployer"}) les pose autour de l'Arche à l'arrêt. Consigne « suivre » : elles rentrent quand l'Arche part et se redéploient où elle s'arrête ; « tenir la place » : elles restent en avant-poste jusqu'au rappel. Une tourelle détruite se reconstruit à bord (30 s, payée).</li>
            <li><b>Relevés</b> : gagnés en explorant (un par carré de 8 × 8 cases découvert) et en détruisant des ennemis ; ils paient la recherche et une part des améliorations. La recherche débloque surtout des améliorations.</li>
          </ul>
        {/if}
        <h3>Furtivité et radar</h3>
        <ul>
          <li>Une unité ennemie apparaît à vue, ou en écho au <b>radar</b>. Le <b>bombardier furtif</b> n'apparaît jamais au radar ; un <b>brouilleur mobile</b> en fait autant pour les alliés dans sa bulle (12 cases).</li>
          <li>Le <b>commando furtif</b> est invisible tant qu'il ne tire pas (5 s après chaque tir). Toute unité ou tout bâtiment le repère à quelques cases, une sonde déployée à 25 cases.</li>
          <li>Le <b>Gardien</b> encaisse mieux de face (-45 %) ; la <b>tourelle mobile</b> ne tire que déployée et encaisse alors mieux (-30 %).</li>
        </ul>
        <h3>Souris</h3>
        <table>
          <tbody>
            <tr><td>Clic gauche / glisser</td><td>Sélectionner / sélection par cadre (Maj : ajouter)</td></tr>
            <tr><td>Double-clic</td><td>Toutes les unités du même type à l'écran</td></tr>
            <tr><td>Clic droit</td><td>Déplacer, attaquer, assister, recycler, charger, ralliement (selon la cible)</td></tr>
            <tr><td>² ou Alt + clic</td><td>Ping : signaler un point à son équipe (carte ou minicarte)</td></tr>
            <tr><td>Maj + ordre</td><td>Mettre l'ordre en file</td></tr>
            <tr><td>Molette</td><td>Zoom continu (vue stratégique avec icônes de loin)</td></tr>
            <tr><td>J maintenu</td><td>Vue logistique : remplissage de chaque tapis (vide, fluide, chargé, saturé) et bâtiments bloqués, affamés ou sans énergie</td></tr>
            <tr><td>Molette (pose de tapis)</td><td>Niveau du tapis : sol, étage 1 ou étage 2. Un tapis surélevé passe au-dessus des tapis et des bâtiments ; entre deux niveaux, un ascenseur se forme tout seul. Un tapis ne livre un bâtiment qu'au sol.</td></tr>
            <tr><td>Clic milieu glissé</td><td>Tourner / incliner la caméra</td></tr>
            <tr><td>Clic droit glissé (unités sélectionnées)</td><td>Formation orientée : les unités se rangent en rectangle au point cliqué, face à la direction du glisser, corps à corps et plus résistants devant, boucliers, puis tireurs, puis unités sans arme (Maj : en file). Le groupe avance à la vitesse du plus lent</td></tr>
            <tr><td>Maj + clic droit (plusieurs unités)</td><td>Formation en file : même rectangle face au trajet, gardé aux points suivants</td></tr>
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
