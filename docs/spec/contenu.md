# Technologies, unités, bâtiments

> Partie de la spécification. Index et liste des fichiers : [docs/SPEC.md](../SPEC.md).

## Technologie

La recherche fonctionne comme dans Factorio : des laboratoires consomment des lots de recherche fabriqués dans l'usine, et chaque recherche débloque des bâtiments, des unités, des recettes ou des améliorations. Chaque joueur fait ses propres recherches, avec le même arbre pour tous puisqu'il n'y a qu'une faction.

Produits intermédiaires :

| Produit | Fabriqué dans | Ingrédients |
| --- | --- | --- |
| Plaque de fer | Fonderie | minerai de fer |
| Plaque de cuivre | Fonderie | minerai de cuivre |
| Acier | Fonderie | plaques de fer |
| Plaquette de silicium | Fonderie | silicium |
| Engrenage | Assembleur | plaques de fer |
| Câble | Assembleur | plaques de cuivre |
| Circuit | Assembleur | plaques de fer, câbles |
| Moteur | Assembleur | acier, engrenages |
| Munitions | Assembleur | acier, plaques de cuivre |
| Processeur | Assembleur | circuits, plaquettes de silicium |
| Carburant | Raffinerie | hydrocarbure |
| Composite | Usine chimique | carburant, acier |
| Cristal raffiné | Raffinerie | cristal |
| Cellule d'énergie | Assembleur | cristal raffiné, processeurs |

Six paliers de recherche, chacun avec son lot. Une recherche d'un palier demande aussi les lots de tous les paliers inférieurs, comme dans Factorio.

| Palier | Lot de recherche | Ingrédients du lot | Débloque notamment |
| --- | --- | --- | --- |
| 1 | Données mécaniques | engrenages, plaques de cuivre | assembleurs, usine terrestre, robots de ligne, chars légers, tourelle légère |
| 2 | Données électroniques | circuits, bras | usine aérienne, centrale à hydrocarbure, artillerie mobile, appareils légers |
| 3 | Données militaires | munitions, acier | usine navale, marcheurs d'assaut, chars glisseurs, canonnières, bombardiers |
| 4 | Données avancées | processeurs, composites | boucliers, canons à ions, marcheurs de siège, plateforme de transfert, raffinage du cristal |
| 5 | Données cristallines | cristal raffiné, processeurs | robots de choc et char lourd, porte de transit, bouclier de zone, missile stratégique, réacteur à cristal |
| 6 | Données orbitales | cellules d'énergie, composites, processeurs | portique expérimental et unités expérimentales, canon orbital |

Les quantités, les coûts et les durées de recherche sont fixés pendant l'équilibrage.

## Unités

La faction compte 58 unités, inspirées de Supreme Commander, Star Wars et Stargate. Les noms sont provisoires.

### Paliers des unités

Comme dans Supreme Commander, un rôle a une version par palier : la variante d'un palier supérieur est plus chère, plus résistante et frappe plus fort. Les six paliers de recherche se regroupent en quatre niveaux, ceux de Supreme Commander : paliers 1 et 2, paliers 3 et 4, palier 5, palier 6 (expérimentales). L'usine aérienne arrive au palier 2 et l'usine navale au palier 3 : leurs échelles commencent là. Le palier d'une unité est entre parenthèses. Tests : `sim/src/paliers_tests.rs` (`industrial_roles_climb_the_tiers` : chaque échelle sort de la même usine et ne descend jamais ; la canonnière lourde vole sur place ; torpilles du bombardier torpilleur ; sonar du sous-marin chasseur). Contrôle d'affichage : `tools/e2e-paliers.mjs` (vitrine : les sept variantes, leurs icônes dans la fiche de sélection, des icônes des Transhumants).

| Rôle | Paliers 1 et 2 | Paliers 3 et 4 | Palier 5 | Palier 6 |
| --- | --- | --- | --- | --- |
| Ingénieur | drone ingénieur (1) | drone ingénieur avancé (3) | drone ingénieur suprême (5) | |
| Robot d'assaut | robot de ligne (1) | marcheur d'assaut (3), droïde roulant (3) | robot de choc (5) | colosse |
| Char | char léger (1) | Gardien (3), char glisseur (3), marcheur de siège (4) | **char lourd** (5) | Char Blatte, araignée de siège |
| Artillerie | artillerie mobile (2) | lance-roquettes à saturation (3), lance-missiles mobile (3), tourelle mobile déployable (4) | artillerie lourde mobile (5) | |
| Antiaérien | défense antiaérienne mobile (2) | **flak mobile** (4) | | |
| Reconnaissance, discrétion | moto-glisseur (1), sonde de détection (2) | brouilleur mobile (4), commando furtif (4) | | |
| Soutien | disrupteur (1) | générateur de bouclier mobile (4), canon à ions mobile (4), lanceur de drones guidés (4) | | forteresse marchante |
| Avion de reconnaissance | avion éclaireur (2) | avion de guerre électronique (4) | **avion espion** (5) | |
| Chasseur | intercepteur (2) | chasseur de supériorité (4) | | |
| Bombardier | planeur d'attaque (2) | bombardier (3), bombardier furtif (4) | bombardier stratégique (5) | vaisseau-mère |
| Canonnière | | canonnière (3) | **canonnière lourde** (5) | Gros Chinois |
| Torpilleur | | **bombardier torpilleur** (3) | | |
| Transport | transport (2) | transport lourd (4) | | croiseur hyperespace |
| Navire de ligne | | frégate (3), destroyer (4) | cuirassé à canons de rail (5) | Cuirassé stellaire |
| Sous-marin | | sous-marin (3) | **sous-marin chasseur** (5) | |
| Antiaérien naval | | **croiseur antiaérien** (4) | croiseur lance-missiles (5) | |
| Porte-avions | | | porte-avions (5) | |

En gras : les sept variantes ajoutées pour compléter les échelles. Recherches : le char lourd vient avec Assaut lourd (ex-Robots de choc), la flak mobile avec Défense antiaérienne lourde (palier 4, après Assaut), l'avion espion et la canonnière lourde avec Aviation stratégique (ex-Bombardier stratégique), le bombardier torpilleur avec Aviation lourde, le croiseur antiaérien avec Escorte navale (ex-Destroyer), le sous-marin chasseur avec Marine lourde.

### Commandement

| Unité | Rôle | Palier | Inspiration |
| --- | --- | --- | --- |
| Robot de commandement | Unité de départ, unique. Construit, répare et combat avec un canon lourd. Sa destruction élimine le joueur. La recherche lui ajoute un bouclier personnel, un canon renforcé et la téléportation par faisceau. | Départ | Supreme Commander (ACU), Stargate (téléportation par faisceau) |
| Drone ingénieur | Construit, répare et recycle les épaves. Trois modèles de plus en plus rapides. | 1, 3, 5 | Supreme Commander |

### Terre

| Unité | Rôle | Palier | Inspiration |
| --- | --- | --- | --- |
| Robot de ligne | Robot d'infanterie bon marché, produit en grand nombre, arme légère | 1 | Star Wars (robots de combat) |
| Disrupteur | Seule arme à énergie qui défait les réplicateurs et leurs ruches ; un cinquième de ses dégâts contre le reste | 1 | Stargate (arme anti-réplicateurs) |
| Droïde roulant | Roule en boule (vitesse 72, sans tirer), se déplie à l'arrêt en 0,8 s en tourelle à deux blasters avec bouclier personnel (900 PV), se replie pour bouger | 3 | Star Wars (droïdeka) |
| Moto-glisseur | Éclaireur très rapide et peu blindé | 1 | Star Wars (motos à répulseurs) |
| Char léger | Char d'appui direct de base | 1 | Supreme Commander |
| Artillerie mobile | Tir indirect à moyenne portée | 2 | Supreme Commander |
| Défense antiaérienne mobile | Canon antiaérien sur chenilles | 2 | Supreme Commander |
| Sonde de détection | Se pose et reste sur place comme radar, détecte les unités invisibles | 2 | Star Wars (sondes de reconnaissance) |
| Marcheur d'assaut | Bipède rapide à deux canons légers | 3 | Star Wars (marcheurs bipèdes) |
| Char glisseur | Char lourd sur répulseurs, passe sur l'eau | 3 | Star Wars, Supreme Commander (aéroglisseurs) |
| Lance-missiles mobile | Missiles à longue portée contre les défenses fixes | 3 | Supreme Commander |
| Générateur de bouclier mobile | Bouclier d'énergie qui protège les unités proches | 4 | Supreme Commander |
| Canon à ions mobile | Paralyse quelques secondes les unités et bâtiments touchés, sans les endommager | 4 | Star Wars |
| Lanceur de drones guidés | Tire des essaims de petits drones explosifs à tête chercheuse | 4 | Stargate (drones des Anciens) |
| Marcheur de siège | Quadripède très blindé, canons lourds, transporte des robots de ligne | 4 | Star Wars (marcheurs quadripèdes) |
| Robot de choc | Robot d'assaut lourd, arme à plasma | 5 | Supreme Commander (robots d'assaut), Stargate (armes à plasma) |
| Artillerie lourde mobile | Très longue portée, se déploie avant de tirer | 5 | Supreme Commander |
| Char lourd | Char très blindé à canon lourd, variante du char léger au palier 5 | 5 | Supreme Commander (chars de siège) |
| Flak mobile | Flak lourde à éclats contre les avions, variante de la défense antiaérienne mobile | 4 | Supreme Commander (flak mobile) |

### Air

| Unité | Rôle | Palier | Inspiration |
| --- | --- | --- | --- |
| Avion éclaireur | Reconnaissance rapide | 2 | Supreme Commander |
| Intercepteur | Chasseur léger contre les avions | 2 | Supreme Commander, Star Wars (chasseurs) |
| Planeur d'attaque | Chasseur-bombardier rapide et fragile, tir plasma contre le sol | 2 | Stargate (planeurs) |
| Transport | Transporte des unités terrestres | 2 | Supreme Commander |
| Canonnière | Appareil lourd en vol stationnaire, tire sur les unités au sol | 3 | Supreme Commander, Star Wars (canonnières) |
| Bombardier | Bombes contre les unités et les bâtiments | 3 | Supreme Commander |
| Chasseur de supériorité | Chasseur lourd contre les avions | 4 | Supreme Commander |
| Bombardier stratégique | Bombes lourdes contre les bâtiments | 5 | Supreme Commander |
| Bombardier torpilleur | Torpilles larguées contre les navires et les sous-marins | 3 | Supreme Commander |
| Avion espion | Le plus rapide des avions : très grande vision et radar, sans arme | 5 | Supreme Commander |
| Canonnière lourde | Vol stationnaire, très résistante, contre le sol ; antiaérien léger | 5 | Supreme Commander |

### Mer (cartes avec eau)

| Unité | Rôle | Palier | Inspiration |
| --- | --- | --- | --- |
| Frégate | Navire léger polyvalent | 3 | Supreme Commander |
| Sous-marin | Attaque les navires sans apparaître au radar | 3 | Supreme Commander |
| Destroyer | Navire de ligne, armes contre surface et sous-marins | 4 | Supreme Commander |
| Croiseur lance-missiles | Missiles à longue portée et défense antiaérienne | 5 | Supreme Commander |
| Croiseur antiaérien | Missiles antiaériens à longue portée, canon de surface | 4 | Supreme Commander (croiseurs) |
| Sous-marin chasseur | Torpilles lourdes ; son sonar porte à 30 cases (18 pour un sous-marin), il repère et coule les sous-marins | 5 | Supreme Commander |

### Expérimentales (palier 6, construites dans le portique expérimental)

| Unité | Rôle | Inspiration |
| --- | --- | --- |
| Araignée de siège | Marcheur à huit pattes, rayon laser prolongé (3 s) tiré depuis le centre de son corps | Supreme Commander (araignée expérimentale) |
| Colosse | Robot humanoïde géant, écrase les unités et tire au laser | Supreme Commander (colosse expérimental) |
| Forteresse marchante | Marcheur géant qui produit des unités terrestres en avançant, protégé par un bouclier | Supreme Commander (usine mobile), Star Wars (marcheurs géants) |
| Vaisseau-mère | Vaisseau volant géant qui lâche des escadrilles de planeurs d'attaque et bombarde le sol | Stargate (vaisseaux-mères), Supreme Commander (soucoupe expérimentale) |
| Croiseur hyperespace | Vaisseau de ligne volant qui saute vers une balise du joueur après un temps de charge | Star Wars (sauts en hyperespace) |
| Char Blatte | Char géant en forme de blatte, sur chenilles avec six pattes articulées ; canons-mandibules à balles et mitrailleuses antiaériennes | Création originale |
| Gros Chinois | Dragon robot volant au corps qui ondule ; souffle de feu prolongé qui brûle une zone, perle d'énergie contre le sol et les avions | Dragons chinois |
| Cuirassé stellaire | Vaisseau géant volant à coque en triangle, batteries de traits d'énergie et défense antiaérienne | Star Wars (vaisseaux de ligne en triangle) |

Les armes se rangent en trois familles, qui se distinguent à l'écran :

- **Cinétiques** (balles, obus) : projectiles métalliques avec un traceur discret (commandant, chars, défense antiaérienne, navires, tourelles légères, Char Blatte).
- **Énergie** : traits lumineux (plasma, ions, traits rouges des unités inspirées de Star Wars, batteries du cuirassé stellaire).
- **Rayons prolongés** : un rayon qui dure plusieurs secondes, suit sa cible et la touche à chaque tick (laser de l'araignée et du colosse, souffle de feu du Gros Chinois). Il s'éteint si la source est détruite ou paralysée, ou si la cible meurt ou sort de portée.

Règles de protection :

- **Boucliers** : une bulle absorbe les tirs ennemis qui retombent dedans quand ils viennent de l'extérieur ou du ciel (avions qui la survolent, bombes). Les tirs qui visent des avions passent. Un bouclier coupé ne consomme rien.
- **Murs** : un mur ennemi arrête les tirs directs (balles, plasma, ions, traits, rails, rayons instantanés) qui le traversent et prend le coup. Obus, missiles, bombes, torpilles, rayons prolongés et tirs vers ou depuis le ciel passent par-dessus.
- **Paralysie** (canon à ions, impulsion électromagnétique) : seulement les unités des couches que l'arme vise (sol et mer), et les bâtiments ; les avions ne sont pas touchés.

### Déplacements

- Séparation des unités (`update_units` dans `sim/src/units.rs`) : deux unités ne se bloquent jamais, elles se repoussent quand elles sont plus proches que la somme de leurs rayons. Entre alliés (même équipe), cette distance est tolérée plus courte, pour que les groupes passent mieux les passages étroits, se croisent et traversent des unités garées :
  - tous deux en marche : 75 % (`SEP_MARCH`), et chacun ne corrige que 3/8 du recouvrement (`SEP_MARCH_PUSH`) un tick sur deux. À 6/8, la paire corrigeait 150 % : elle se repoussait trop loin et l'avance s'annulait dans la foule ;
  - au moins un des deux à l'arrêt : 90 % (`SEP_REST`). Pas moins : un groupe garé plus serré prendrait nettement plus de dégâts des tirs de zone, et les modèles (2,3 rayons de long) se recouvriraient en permanence ;
  - entre ennemis, et pour les très grosses unités (rayon de plus de 500) : 100 %.
  - En marche : l'unité suit un déplacement, une patrouille, une attaque, une entrée dans un transporteur, un déploiement ou une navette, et n'est pas arrêtée pour tirer (`marching`). La règle lit l'ordre, jamais le mouvement réel : une unité bousculée à l'arrêt ne passe pas pour une unité en marche, donc un groupe arrivé se redéploie et s'immobilise. Le rayon lui-même (taille des modèles, portée, places des formations) ne change pas.
  - Tests : `sim/src/separation_tests.rs`.
- Déplacement en formation orientée (clic droit glissé, comme dans Supreme Commander) : le point d'appui est le but, la direction du glisser donne l'angle. Le groupe s'y range en rectangle tourné vers l'angle, chaque unité à sa place selon son rôle.
  - Rectangle : les places sont calculées par la simulation (`plan` et `rectangle` dans `sim/src/formation.rs`), centrées sur le but. Les rangées se remplissent de l'avant vers l'arrière dans l'ordre des rôles. La largeur visée est le double de la profondeur (d'après la place qu'occupent les unités, une demi-case entre voisines), puis la plus petite qui donne le même nombre de rangées : 24 unités de même taille font 4 rangées de 6. Chaque rangée occupe toute la largeur (les écarts s'ouvrent si ses unités sont plus petites) ; la dernière est centrée, aux écarts normaux, si elle remplit moins des deux tiers de la largeur. Entre deux rangées : la somme de leurs plus grands rayons plus une demi-case. Dans une rangée, chacun garde son côté (gauche ou droite) pour ne pas croiser ses voisins ; entre unités du même type, celles qui sont déjà devant y restent. Chaque famille d'unités (terrestres et glisseurs, navales, volantes) forme son propre bloc centré sur le but.
  - Rôles, de l'avant vers l'arrière (`rank`) : corps à corps (portée d'au plus 4 cases) ; ligne de tir direct et sacs à points de vie ; porteurs de bouclier sans arme, dont la bulle couvre les deux côtés ; tireurs (portée d'au moins 28 cases) et unités qui ne tirent que sur l'air ; unités sans arme (constructeurs, chariots, transports, brouilleurs) ; unité de commandement. Un tireur qui a au moins 150 points de vie par case de portée compte comme sac à points de vie (colosse, araignée, destroyer). Dans un rôle, les plus résistants (points de vie et bouclier) sont devant ; parmi les tireurs, les plus longues portées sont derrière. Les valeurs sont celles du type d'unité, sans les améliorations.
  - Ordre : `O_MOVE` avec les drapeaux 4 et 8, suivi de l'angle (16 bits), chaque unité portant le but du groupe ; elle reçoit sa place, puis un `Order::Face` mis en file derrière son déplacement. Le drapeau 4 sans le 8 (places données par l'ordre) reste accepté. Avec Maj, le rectangle part de la fin des files ; s'il prolonge une formation en file, le groupe passe le point précédent sans s'arrêter pour se tourner.
  - Aperçu : une flèche par place et une grande flèche pour l'angle suivent le glisser. Le client demande les places à la simulation du worker (`formation_preview`, requête `formation`, une à la fois) : ce sont celles que l'ordre donnera, aux mouvements près entre l'aperçu et l'application de l'ordre.
  - Allure : chaque unité va au plus à la vitesse de la plus lente du groupe, quelle que soit la distance de sa place (`paces` dans `sim/src/formation.rs`, champ `Order::Move::pace` en seizièmes de sous-unité par tick). Un groupe d'une seule sorte d'unité n'est donc jamais ralenti. Le terreau de la Souche s'applique par-dessus. Chaque famille d'unités (terrestres et glisseurs, navales, volantes : `formation::family`) règle son allure sur sa plus lente ; les avions à voilure fixe et une unité seule de sa famille gardent leur vitesse.
  - Trajet : le champ de flux mène au but du groupe. En formation, une unité le lit à sa position moins son écart dans la formation (là où serait le but du groupe si elle était à sa place) : elle suit un chemin parallèle à celui du centre du groupe, qui garde sa disposition en route au lieu de se resserrer sur le chemin le plus court ; bloquée (plus de 10 ticks sans avancer) ou si cette case est hors du champ, elle lit sa propre case. À moins de 5 cases de sa place, elle y va droit. Hors formation, une unité quitte le champ pour aller droit à sa place dès qu'elle est à moins de 5 cases de celle-ci ou qu'elle est aussi près du but du groupe que sa place (à 5 cases près). Sans cette règle, dans un grand groupe, une unité dont la place est à plus de 5 cases du but tournait autour du but sans l'atteindre et s'arrêtait loin de sa place.
  - Arrivée : en formation, chaque unité va jusqu'à moins d'un quart de case de sa place (au lieu de s'arrêter dès qu'elle la touche), pour que les lignes restent droites (elle attend 5 s sans progrès avant de renoncer, le temps qu'un voisin qui croise son chemin se dégage), puis se tourne exactement vers l'angle. Une unité qui bute sur une voisine la contourne (cap écarté de 60°, d'un côté puis de l'autre). Les premières arrivées attendent les autres à leur place, 15 s au plus, en se tournant déjà vers l'angle ou le point suivant ; poussées par un retardataire qui passe, elles y reviennent (`hold` dans `sim/src/formation.rs`). Tests : `sim/src/formation_tests.rs` (`dragged_formation_*`, `formation_ranks_by_role`, `formation_of_one_kind_is_not_slowed`, `formation_goes_at_the_slowest_speed`, `big_crossing_formation_reaches_every_slot`) et `packages/shared/test/formation.test.ts` ; en jeu : `?demo=formation` (une armée mêlée du joueur 0, ordres appliqués en local) et `tools/e2e-formation.mjs`.

- Déplacement en formation en file (Maj + clic droit sur le terrain, plusieurs unités ; aussi sur la mini-carte) : `O_MOVE` avec les drapeaux 1 et 8, chaque unité portant le but du groupe ; la simulation calcule les places (`sim/src/formation.rs`, `planned_formation` dans `sim/src/orders.rs`). Chaque famille forme son propre bloc centré sur le but.
  - Premier point de la file : le groupe se range dans le même rectangle par rôles que la formation orientée, face à la direction qui va du centre des fins de file des unités (positions actuelles, ou fin de leur dernier déplacement en file) vers le but (si le but est à moins de 2 cases de ce centre : l'orientation de la première unité).
  - Points suivants : si toutes les unités finissent leur file par la même formation (dernier déplacement en formation, même but et même angle, puis l'orientation finale), le groupe garde sa disposition, tournée vers la direction du nouveau segment (du point précédent au nouveau ; tout droit, elle est seulement déplacée). L'orientation finale du point précédent est retirée : seul le dernier point a une orientation finale. Un tournant fait pivoter le bloc progressivement le long du segment : l'extérieur va à la vitesse du plus lent, l'intérieur, qui a moins de chemin, ralentit en proportion.
  - Point intermédiaire : le groupe s'y attend (`hold`) et repart ensemble dès que chacun est à moins d'une demi-case de sa place et tourné vers le point suivant. Un groupe déjà en rangs ne marque qu'un bref arrêt, le temps de pivoter ; une unité en retard (détour, combat) y reprend sa place dans les rangs.
  - Cas limites : une unité ajoutée à la sélection, ou des unités qui ne partagent pas la même formation, font repartir en rangées depuis la fin de leurs files. Une unité tuée en route laisse un trou ; les autres gardent leur place. Une unité qui bute sur un obstacle le contourne par sa propre case du champ de flux ; le groupe l'attend au point suivant. Un ordre sans Maj annule la file et la formation ; le Maj + clic droit suivant range à nouveau le groupe. Une fois le groupe arrivé et tourné (file vide), le Maj + clic droit suivant range à nouveau le groupe (à l'identique s'il n'a pas bougé). Les navires mêlés à des unités terrestres forment leur propre bloc sur le même but, et s'arrêtent au plus près s'il est sur la terre. Une seule unité va droit au but. Un Maj + clic droit glissé range à nouveau le groupe en rectangle, face à l'angle choisi ; le Maj + clic droit suivant garde ce rectangle. Tests : `queued_formation_*` dans `sim/src/formation_tests.rs` ; en jeu : `tools/e2e-formation-file.mjs` (démo `?demo=formation`, deux Maj + clic droit).

## Bâtiments

Les bâtiments de production viennent de Factorio, les bâtiments militaires de Supreme Commander, et les bâtiments spéciaux reprennent des mécaniques de Stargate et de Star Wars. Le palier 0 signifie disponible dès le départ.

### Production et énergie

| Bâtiment | Rôle | Palier |
| --- | --- | --- |
| Extracteur | Extrait une ressource brute sur un gisement | 0 |
| Tapis roulant | Transporte les objets, trois vitesses | 0, 3, 5 |
| Bras | Prend et dépose les objets entre tapis et bâtiments | 0 |
| Fonderie | Fond les minerais et le silicium | 0 |
| Assembleur | Fabrique les produits intermédiaires, trois modèles de plus en plus rapides | 1, 3, 5 |
| Raffinerie | Transforme l'hydrocarbure et le cristal | 2 |
| Usine chimique | Fabrique les composites | 3 |
| Laboratoire | Consomme les lots de recherche | 0 |
| Dépôt | Stocke les objets (600 par objet, 2 000 amélioré) où les drones des constructeurs viennent puiser ; ressort ses objets (filtrés ou non) sur les tapis et les bras | 0 |
| Générateur principal | Générateur de départ : grande zone, brûle de l'hydrocarbure | 0 |
| Générateur | Crée une zone électrique, brûle de l'hydrocarbure ou du carburant | 0 |
| Relais | Étend une zone électrique (petite zone) et relie les zones | 0 |
| Relais logistique | Étend le réseau des dépôts : ses drones portent, depuis les dépôts reliés de relais en relais, ce qui manque aux chantiers, usines et générateurs de sa zone (voir economie.md) | 1 |
| Centrale à hydrocarbure | Grosse production d'énergie, brûle de l'hydrocarbure ou du carburant | 2 |
| Centrale géothermique | Posée sur un geyser, produit sans combustible une énergie qui ondule | 2 |

### Militaire

| Bâtiment | Rôle | Palier |
| --- | --- | --- |
| Usine terrestre | Produit les unités terrestres | 1 |
| Usine aérienne | Produit les appareils | 2 |
| Usine navale | Produit les navires | 3 |
| Portique expérimental | Construit les unités expérimentales | 6 |
| Radar | Détecte les unités dans un large rayon | 1 |
| Mur | Bloque le passage et les tirs directs | 1 |
| Tourelle légère | Défense contre les unités terrestres légères | 1 |
| Tourelle antiaérienne | Défense contre les appareils | 2 |
| Tourelle lourde | Défense contre les unités blindées | 3 |
| Artillerie fixe | Tir à longue portée sur les bases adverses | 4 |
| Générateur de bouclier fixe | Bouclier qui protège les bâtiments proches | 4 |

### Bâtiments spéciaux

| Bâtiment | Rôle | Palier | Inspiration |
| --- | --- | --- | --- |
| Plateforme de transfert | Téléporte un petit groupe d'unités vers une autre plateforme proche | 4 | Stargate (anneaux de transport) |
| Porte de transit | Paire de portes : les unités qui entrent dans l'une ressortent par l'autre, n'importe où sur la carte. Grosse consommation d'énergie à l'ouverture | 5 | Stargate (portes) |
| Bouclier de zone | Grand bouclier qui couvre une base entière | 5 | Stargate (boucliers de cité), Supreme Commander |
| Réacteur à cristal | Très grosse production d'énergie, explose quand il est détruit | 5 | Stargate (sources d'énergie) |
| Silo de missile stratégique | Missile à très longue portée qui détruit une zone entière | 5 | Supreme Commander |
| Défense antimissile | Abat les missiles stratégiques | 5 | Supreme Commander |
| Balise d'hyperespace | Point d'arrivée des sauts du croiseur hyperespace | 6 | Star Wars |
| Canon orbital | Superarme qui frappe n'importe quel point de la carte à intervalles longs | 6 | Star Wars, Supreme Commander (artillerie expérimentale) |
