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
| 5 | Données cristallines | cristal raffiné, processeurs | robots de choc, porte de transit, bouclier de zone, missile stratégique, réacteur à cristal |
| 6 | Données orbitales | cellules d'énergie, composites, processeurs | portique expérimental et unités expérimentales, canon orbital |

Les quantités, les coûts et les durées de recherche sont fixés pendant l'équilibrage.

## Unités

La faction compte 37 unités, inspirées de Supreme Commander, Star Wars et Stargate. Les noms sont provisoires.

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

### Mer (cartes avec eau)

| Unité | Rôle | Palier | Inspiration |
| --- | --- | --- | --- |
| Frégate | Navire léger polyvalent | 3 | Supreme Commander |
| Sous-marin | Attaque les navires sans apparaître au radar | 3 | Supreme Commander |
| Destroyer | Navire de ligne, armes contre surface et sous-marins | 4 | Supreme Commander |
| Croiseur lance-missiles | Missiles à longue portée et défense antiaérienne | 5 | Supreme Commander |

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

- Déplacement en formation orientée (clic droit glissé, comme dans Supreme Commander) : le point d'appui est le but, la direction du glisser donne l'angle.
  - Disposition : le groupe garde sa disposition actuelle (écarts au centre du groupe, resserrés s'il est très étalé comme pour un déplacement simple), tournée pour que son avant regarde vers l'angle, et centrée sur le but. L'avant du groupe est la moyenne des orientations de ses unités si elles regardent à peu près du même côté (vecteur moyen d'au moins 0,5), sinon la direction du centre du groupe vers le but. Un aperçu (une flèche par place, une grande flèche pour l'angle) suit le glisser. Code : `formationSlots` et `groupHeading` dans `packages/shared/src/orders.ts`.
  - Ordre : `O_MOVE` avec le drapeau 4 suivi de l'angle (16 bits) ; chaque unité reçoit sa place, puis un `Order::Face` mis en file derrière son déplacement.
  - Allure : le groupe avance à la vitesse de son unité la plus lente et arrive ensemble. À l'application de l'ordre, la durée prévue est la plus longue distance à parcourir (depuis la position actuelle, ou la fin du dernier déplacement en file avec Maj) divisée par la vitesse de la plus lente, plus 1 s pour tourner (`formation_etas` dans `sim/src/orders.rs`). Elle devient un tick d'arrivée au premier tick de l'ordre (`Order::Move::eta`). À chaque tick, une unité va à la vitesse qui l'amène à sa place à ce tick, sans dépasser la sienne : en avance elle ralentit ou attend, en retard (détour, combat d'un déplacement offensif) elle rattrape à pleine vitesse (`formation_pace` dans `sim/src/units.rs`). Chaque famille d'unités (terrestres et glisseurs, navales, volantes : `formation::family`) règle son allure sur sa plus lente ; les avions à voilure fixe gardent leur vitesse.
  - Trajet : le champ de flux mène au but du groupe. En formation, une unité le lit à sa position moins son écart dans la formation (là où serait le but du groupe si elle était à sa place) : elle suit un chemin parallèle à celui du centre du groupe, qui garde sa disposition en route au lieu de se resserrer sur le chemin le plus court ; bloquée (plus de 10 ticks sans avancer) ou si cette case est hors du champ, elle lit sa propre case. À moins de 5 cases de sa place, elle y va droit. Hors formation, une unité quitte le champ pour aller droit à sa place dès qu'elle est à moins de 5 cases de celle-ci ou qu'elle est aussi près du but du groupe que sa place (à 5 cases près). Sans cette règle, dans un grand groupe, une unité dont la place est à plus de 5 cases du but tournait autour du but sans l'atteindre et s'arrêtait loin de sa place.
  - Arrivée : en formation, chaque unité va jusqu'à moins d'un quart de case de sa place (au lieu de s'arrêter dès qu'elle la touche), pour que les lignes restent droites (elle attend 5 s sans progrès avant de renoncer, le temps qu'un voisin qui croise son chemin se dégage), puis se tourne exactement vers l'angle. Test : `sim/src/formation_tests.rs` ; en jeu : `?demo=formation` (une armée mêlée du joueur 0, ordres appliqués en local) et `tools/e2e-formation.mjs`.

- Déplacement en formation en file (Maj + clic droit sur le terrain, plusieurs unités ; aussi sur la mini-carte) : `O_MOVE` avec les drapeaux 1 et 8, chaque unité portant le but du groupe ; la simulation calcule les places (`sim/src/formation.rs`, `queued_formation` dans `sim/src/orders.rs`). Chaque famille d'unités (terrestres et glisseurs, navales, volantes) forme son propre bloc centré sur le but.
  - Premier point de la file : le groupe se range en rangées droites, face à la direction qui va du centre des fins de file des unités (positions actuelles, ou fin de leur dernier déplacement en file) vers le but (si le but est à moins de 2 cases de ce centre : l'orientation de la première unité). Environ deux fois plus de colonnes que de rangées (colonnes = ⌈√(2n)⌉, puis rangées équilibrées), le but au centre du bloc. Devant : les unités armées de courte portée ; derrière : les plus longues portées, puis les unités sans arme (à égalité, les plus petites devant). Dans une rangée, l'espacement est le diamètre de sa plus grosse unité plus une demi-case, et chacun garde son côté (gauche ou droite) pour ne pas croiser ses voisins ; entre deux rangées, la somme de leurs plus grands rayons plus une demi-case.
  - Points suivants : si toutes les unités finissent leur file par la même formation (dernier déplacement en formation, même but et même angle, puis l'orientation finale), le groupe garde sa disposition, tournée vers la direction du nouveau segment (du point précédent au nouveau ; tout droit, elle est seulement déplacée). L'orientation finale du point précédent est retirée : le groupe passe le point sans s'arrêter, et seul le dernier point a une orientation finale. La marge pour tourner est de 0,5 s au lieu de 1 s. Un tournant fait pivoter le bloc progressivement le long du segment.
  - Horloge commune : à la fin d'un segment, le suivant compte sa durée à partir du tick d'arrivée prévu pour le groupe, pas du tick où l'unité arrive (`chain_eta` dans `sim/src/units.rs`) : une unité en retard rattrape, une en avance ralentit, et la disposition se garde sur toute la file.
  - Cas limites : une unité ajoutée à la sélection, ou des unités qui ne partagent pas la même formation, font repartir en rangées depuis la fin de leurs files. Une unité tuée en route laisse un trou ; les autres gardent leur place. Une unité qui bute sur un obstacle le contourne par sa propre case du champ de flux, puis rattrape à pleine vitesse. Un ordre sans Maj annule la file et la formation ; le Maj + clic droit suivant range à nouveau le groupe. Une fois le groupe arrivé et tourné (file vide), le Maj + clic droit suivant range à nouveau le groupe (à l'identique s'il n'a pas bougé). Les navires mêlés à des unités terrestres forment leur propre bloc sur le même but, et s'arrêtent au plus près s'il est sur la terre. Une seule unité va droit au but. Le Maj + clic droit glissé reste la formation orientée ci-dessus (disposition actuelle). Tests : `queued_formation_*` dans `sim/src/formation_tests.rs`.

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
