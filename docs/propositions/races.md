# Propositions : cinq races jouables

Nov 22, 2026 · document de conception, rien n'est codé.

Le jeu n'a qu'une faction, appelée ici **les Industriels** : gisements, extracteurs, tapis et bras, fonderies et assembleurs, électricité par zones, réserve commune alimentée par les dépôts, drones ingénieurs, laboratoires et lots, usines terrestres, aériennes et navales (voir [economie.md](../spec/economie.md), [energie.md](../spec/energie.md), [contenu.md](../spec/contenu.md)).

Ce document propose cinq races de plus. Chacune change la façon de jouer, pas seulement les noms et les chiffres :

| Race | En une phrase |
| --- | --- |
| [Les Copistes](#1-les-copistes-réplication) | Des machines faites de briques qui se recopient : chaque unité est à la fois soldat, usine et réserve de matière. |
| [La Souche](#2-la-souche-biologie) | Une base vivante qui pousse : un réseau de racines remplace les tapis et l'électricité, et la race évolue par mutations. |
| [Les Diaphanes](#3-les-diaphanes-lumière) | Des êtres de lumière : bâtiments et unités sont des projections qui n'existent que tant qu'un prisme les alimente. |
| [Les Sapeurs](#4-les-sapeurs-souterrain) | Un peuple de mineurs qui vit sous terre, creuse pour extraire et se déplacer, et fait s'effondrer les bases ennemies. |
| [Les Transhumants](#5-les-transhumants-nomades) | Un peuple sans base fixe : toute l'industrie roule sur d'immenses chenillards qui se déploient pour produire. |

Les chiffres donnés sont des valeurs de départ, à fixer pendant l'équilibrage. Les noms sont provisoires.

Règles suivies pour toutes les races :

- La simulation reste déterministe : entiers ou virgule fixe, pas de HashMap parcourue, entités traitées par identifiant croissant, aléatoire seulement par le générateur à graine de la partie ou par `hash3` de la position.
- La partie de référence (8 joueurs, 8 000 unités, 40 000 bâtiments, moins de 25 ms par tick) doit tenir quelles que soient les races choisies. La limite de 1 000 unités par joueur vaut pour toutes.
- Chaque race a une unité de commandement unique dont la destruction élimine le joueur, comme le robot de commandement.
- Aucune race n'est obligée de jouer contre une autre en particulier : les forces et faiblesses sont des tendances (de l'ordre de 20 à 30 % sur un affrontement à coût égal), pas des contres absolus.

---

## 1. Les Copistes (réplication)

**Principe.** Une race de machines faites de briques identiques qui se recopient : chaque unité est à la fois soldat, usine et réserve de matière.

Règles détaillées, chiffres, déroulé d'une partie et plan de réalisation : [copistes.md](copistes.md).

### Économie

- **La masse** remplace presque tout. Chaque assemblage (unité ou bâtiment des Copistes) porte un nombre entier de briques. Ses points de vie, ses dégâts et sa taille à l'écran suivent ce nombre (par exemple 10 PV par brique).
- **Brouter** : un assemblage posé à côté d'un gisement de fer ou de cuivre le mange directement, sans extracteur ni fonderie, et gagne des briques. C'est la récolte du commandant (`Order::Harvest`) étendue à toutes les formes de récolte, avec la pureté du gisement. Une brique par minerai.
- **Les noyaux** limitent la croissance. Un assemblage ne peut se scinder en deux que s'il fabrique un noyau, et un noyau demande du silicium brouté. Le fer et le cuivre font grossir les assemblages ; le silicium en fait des nouveaux. Chaque noyau tient au plus un certain nombre de briques (60 au départ, 120 puis 240 par la recherche) : au-delà, l'assemblage n'absorbe plus rien.
- **Le cristal** donne des matrices, nécessaires aux formes avancées (aériennes lourdes, Agrégat).
- **L'hydrocarbure ne leur sert à rien.** Les Copistes n'ont pas d'électricité : chaque brique porte sa propre énergie. Ils laissent donc aux autres races un gisement que celles-ci doivent défendre.
- **Pas de tapis, pas de bras, pas de réserve commune.** La matière est dans les unités. Pour la stocker ou la déplacer, un assemblage fusionne avec un autre ou se fige en **Ruche**, un bâtiment-réserve qui rend sa masse à qui vient la chercher.
- **Les épaves** (unités, bâtiments, bêtes de la faune) sont mangées comme un gisement : leur masse devient des briques, avec un bonus de recherche (voir plus bas).

### Recherche

Pas de laboratoires ni de lots : les Copistes progressent par **rétro-ingénierie**.

- Un assemblage qui absorbe une épave en tire un **schéma** de sa famille : terrestre, aérien, naval, bâtiment, cristallin. Les épaves de réplicateurs de la faune, cousins éloignés, donnent un schéma double.
- Sans combat, un **Calculateur** (bâtiment figé) digère lentement de la masse et produit des schémas de la famille qu'on lui donne. On peut donc progresser seul, mais trois à quatre fois moins vite qu'en mangeant l'ennemi.
- L'arbre a cinq branches, chacune sur quatre niveaux, payées en schémas de leur famille :
  - **Formes terrestres** : Essaim, Lanceur, Agrégat ;
  - **Ailes** : Nuée ailée, puis formes lourdes ;
  - **Coques** : formes flottantes ;
  - **Figements** : tourelles, murs, Ruche, Calculateur ;
  - **Noyaux** : capacité des noyaux, vitesse de scission, résistances.
- Conséquence : plus l'adversaire est varié, plus les Copistes apprennent vite. Contre un adversaire qui n'aligne que des chars, ils n'avancent vite que dans les formes terrestres.

### Construction et production

- **Pas d'ingénieurs ni d'usines.** On produit en divisant.
- **Scission** : un assemblage d'au moins deux fois la taille minimale de sa forme, avec un noyau prêt, se coupe en deux en 20 s, immobile. La croissance est exponentielle, freinée par le silicium, le temps de scission et la limite d'unités.
- **Fusion** : deux assemblages de même forme qui se touchent fusionnent ; le plus petit identifiant reste. Fusionner fait baisser le nombre d'unités, ce qui sert aussi la performance.
- **Reformage** : un assemblage change de forme en 10 s, si la forme est recherchée.
- **Figement** : un assemblage assez gros se fige sur place en bâtiment (tourelle, mur, Ruche, Calculateur, nid d'envol). Le bâtiment garde ses briques. **Dégel** : il redevient un assemblage avec 90 % de sa masse. Les murs d'une base peuvent donc partir à l'attaque.

### Unités

| Forme | Rôle |
| --- | --- |
| **Noyau-mère** (commandement) | Assemblage unique, ne se scinde pas, ne se fige pas. Broute, fabrique des noyaux deux fois plus vite. Sa destruction élimine le joueur. |
| **Brouteur** | Forme de récolte, lente, sans arme. Mange gisements et épaves. |
| **Essaim** | Combat au corps-à-corps. Son arme, le désassembleur, arrache des briques à la cible mécanique (unités, bâtiments) et en garde un quart : l'essaim grossit en combattant, jusqu'au plafond de son noyau. |
| **Lanceur** | Combat à distance. Projette des briques (arme cinétique) ; chaque tir coûte une brique. |
| **Tisseur** | Fige et dégèle plus vite, répare en donnant ses briques, transfère de la masse à distance entre deux assemblages. |
| **Nuée ailée** | Forme volante, rapide, chère en noyaux (un noyau pour 20 briques au plus). |
| **Agrégat** (avancé) | Fusion de plusieurs essaims, jusqu'à 1 000 briques ; écrase les unités légères. Peut se rescinder en essaims. |

### Forces, faiblesses, contres

- **Forces** : croissance rapide, aucune chaîne de production à protéger, récupère ses pertes et celles de l'ennemi, change de composition en quelques secondes.
- **Faiblesses** : le silicium fixe le nombre d'assemblages ; une unité blessée est aussi une unité plus faible ; peu de portée avant le milieu de partie ; défense fixe médiocre (les figements sont de la masse immobilisée).
- **Résistances** : armes à énergie −50 % (pas de circuits à griller), acide et poison sans effet. Dégâts de zone (explosions, obus) +50 % : les briques se détachent. Le disrupteur des Industriels leur fait trois fois ses dégâts normaux (cinq fois moins que contre la faune).
- **Bat** la Souche (immunisés à l'acide) et les Diaphanes (armes à énergie).
- **Perd contre** les Sapeurs (mines et explosifs) et les Transhumants (canons cinétiques lourds, et une base qui part quand on veut la manger).
- **Face aux Industriels** : leur disrupteur et leur artillerie les gênent ; les Copistes gagnent s'ils mangent les épaves du premier combat.

### Ce qu'il faut changer dans le code

- `UnitCold::mass` (briques), `Building::mass` ; PV et dégâts calculés d'après la masse. Noyaux et matrices dans le stock du joueur, comme les fragments d'énergie.
- Ordres nouveaux : scinder, fusionner, reformer, figer, dégeler (`O_SPLIT`, `O_MERGE`, `O_REFORM`, `O_FREEZE`, `O_THAW`).
- Récolte : `Order::Harvest` généralisé à toute forme qui broute ; le recyclage des épaves donne des schémas.
- Désassembleur : une arme qui rend une partie des dégâts en masse au tireur (dans le traitement des impacts de `combat.rs`).
- Recherche par schémas : des compteurs par famille au lieu des lots.
- **Points délicats** :
  - Déterminisme : la fusion garde le plus petit identifiant ; la scission crée la nouvelle unité dans l'ordre des identifiants ; aucune difficulté particulière.
  - Performance : la croissance exponentielle bute sur la limite de 1 000 unités, et la fusion la fait baisser. Aucun objet ne circule, aucun tapis : la race coûte moins cher que les Industriels.
  - Interface : barre de masse et de noyaux sur chaque assemblage, bouton de scission groupée (« scinder tout ce qui peut »), aperçu de la forme figée.
  - Bots : règles simples (brouter, scinder dès qu'un noyau est prêt, fusionner avant l'attaque, manger les épaves après le combat). C'est la race la plus facile à faire jouer par un bot.
- **Taille : moyenne.**

### Inspirations

Les machines autoréplicatrices de von Neumann, la « gelée grise » des nanotechnologies, les jeux de construction en briques, les réplicateurs de la faune du jeu (et ceux d'une célèbre série de portes, dont ils sont déjà un clin d'œil). Le nom vient des moines copistes : ici, ce sont eux qui se recopient.

---

## 2. La Souche (biologie)

**Principe.** Une base vivante qui pousse : un réseau de racines remplace les tapis et l'électricité, et la race évolue par mutations choisies, dont certaines s'apprennent au combat.

### Économie

- **Deux ressources** : la **sève** (énergie et matière à la fois) et les **sels** (minéraux).
- **Sève** :
  - Les **frondaisons** se posent n'importe où sur le terreau, sans gisement, et produisent un peu de sève. Deux frondaisons à moins de 4 cases se font de l'ombre et produisent moins : la Souche doit s'étaler.
  - Une **racine-puits** sur un gisement d'hydrocarbure (une vie très ancienne) en tire beaucoup de sève.
- **Sels** : une racine-puits sur un gisement de fer ou de cuivre donne des sels ; sur du silicium, de la silice (carapaces, ailes) ; sur du cristal, de la luciférine (organismes avancés).
- **Digestion** : tout cadavre qui tombe sur le terreau (unités tuées, bêtes de la faune, épaves) est digéré en sève, en sels et en ADN (voir Recherche). Les champs de bataille sur son territoire nourrissent la Souche.
- **Racines au lieu de tapis, de bras et d'électricité** :
  - Les racines se tracent comme des tapis mais ne portent pas d'objets. Chaque réseau connexe de racines est une **réserve commune** : sève et sels sont mis en commun entre tous les organes qui y sont branchés.
  - C'est le modèle des zones électriques appliqué à la matière : pas de flux case par case, un compte par réseau, recalculé quand une racine est posée ou détruite.
  - Couper une racine coupe le réseau en deux et partage la réserve au prorata des organes de chaque morceau. Une partie de la base peut donc mourir de faim.
  - Un **Bulbe** agrandit la réserve de son réseau, comme un dépôt agrandit la réserve des Industriels.
- **Terreau** : autour de chaque racine (3 cases), le sol devient du terreau. Les organes ne poussent que sur le terreau, et les organismes de la Souche s'y régénèrent. Le terreau ne gêne pas les ennemis ; il disparaît quand la racine meurt.

### Recherche

Pas de laboratoires : la Souche **évolue**.

- **ADN** : la digestion des cadavres et une **Matrice** qui consomme de la sève donnent des points d'ADN.
- **Arbre en buisson, à choix exclusifs** : cinq stades. À chaque stade, pour chaque famille d'organismes, on choisit une mutation parmi deux ou trois, pour toute la partie. Exemples :
  - Carapace : *écailles* (blindage +30 %) ou *épines* (renvoie un quart des dégâts au corps-à-corps) ;
  - Cracheur : *acide* (ronge le blindage) ou *spores* (zone plus large, dégâts plus faibles) ;
  - Racines : *profondes* (détectent les galeries souterraines) ou *épaisses* (deux fois plus de PV).
  Deux joueurs de la Souche ne jouent donc pas pareil, et l'adversaire doit aller voir quelles mutations ont été prises.
- **Caractères acquis** : un organisme de vétérance 3 ou plus ramené à la Matrice fixe dans l'espèce entière une résistance de 20 % à la famille de dégâts qu'il a le plus reçue (cinétique, énergie, explosifs, feu, ions). La Souche s'adapte à l'arme principale de son adversaire, qui doit en changer.

### Construction et production

- **Semeurs** : les ouvriers plantent des **graines** sur le terreau. La graine pousse seule en tirant la sève de son réseau ; le semeur peut repartir. Un organe pousse plus lentement qu'un bâtiment des Industriels ne se construit, et il est fragile pendant sa croissance.
- **Organes** : frondaison, racine-puits, racine, Bulbe, **Couveuse**, **Matrice**, **Épine** (défense), **Floraison** (vision et détection par spores).
- **Couveuse** : elle pond des œufs (4 à la fois au départ), qui éclosent chacun en 15 s. On produit par lots plutôt qu'à la chaîne.
- **Régénération** : organes et organismes regagnent 2 % de leurs PV par seconde sur le terreau, rien en dehors.
- **Domestication de la faune** : la Reine qui reste 30 s à côté d'un nid de mordeurs sauvage le greffe à son réseau. Le nid devient une couveuse du joueur, qui fait naître des mordeurs sans coût, mais lentement, et n'attaque plus ce joueur. Un nid par stade d'évolution au plus.

### Unités

| Organisme | Rôle |
| --- | --- |
| **La Reine** (commandement) | Lente, pond les graines-mères (un organe de départ par réseau), domestique les nids. Peut s'enraciner : immobile, elle devient une forteresse qui nourrit son réseau. |
| **Semeur** | Ouvrier : plante, soigne les organes. |
| **Rongeur** | Corps-à-corps rapide et bon marché, naît par quatre. |
| **Cracheur** | Artillerie acide : dégâts sur la durée et zone qui ronge le blindage. |
| **Carapace** | Char vivant, très résistant, se régénère, piétine l'infanterie. |
| **Liane** | Enlace une unité au sol et l'immobilise quelques secondes ; très efficace contre les chenillards et les débouchés de galeries. |
| **Planeur à membranes** | Unité aérienne : bombe de spores, et les cadavres de la zone deviennent des graines (terreau provisoire). |
| **Léviathan** (eau) | Amphibie, avale les petits navires. |

### Forces, faiblesses, contres

- **Forces** : pas de chaînes de production complexes ; sève disponible partout ; régénération ; s'adapte à l'arme de l'ennemi ; profite des combats sur son terrain ; la faune peut devenir une alliée.
- **Faiblesses** : tout dépend du réseau (une racine coupée affame une partie de la base) ; croissance lente ; organes immobiles ; aucune régénération loin de chez soi ; feu +50 %.
- **Bat** les Sapeurs (les racines profondes détectent les galeries) et les Transhumants (lianes qui immobilisent, dégâts sur la durée contre les gros chenillards).
- **Perd contre** les Copistes (immunisés à l'acide, mangent ses cadavres avant elle) et les Diaphanes (la lumière brûle : leurs rayons comptent comme du feu).
- **Face aux Industriels** : le souffle de feu et l'artillerie qui coupe les racines la gênent ; elle gagne si le combat a lieu sur son terreau.

### Ce qu'il faut changer dans le code

- **Réseaux** : l'algorithme des zones électriques (`net`, `power_dirty`) rendu générique, pour des connecteurs propres à la race et une réserve par réseau (`Network { seve, sels, plafond }`, rangés par identifiant). Le partage lors d'une coupure se fait en entiers, le reste au plus petit identifiant.
- **Terreau** : une grille d'un octet par case (propriétaire + 1), mise à jour seulement quand une racine est posée ou détruite.
- **Croissance** : le chantier tire la sève du réseau au lieu des objets du stock.
- **Régénération** : un test de grille par organisme et par tick, seulement pour les unités de la Souche.
- **Digestion** : à la mort d'une unité ou d'un bâtiment sur le terreau, ajout au réseau de la case.
- **Mutations** : des bits par joueur ; les statistiques effectives de chaque espèce sont recalculées au moment d'une mutation et gardées dans une table par joueur, jamais à chaque tick.
- **Caractères acquis** : cinq compteurs de dégâts reçus par famille dans `UnitCold`.
- **Domestication** : changement de propriétaire d'un nid dans `nature.rs`.
- **Points délicats** :
  - Performance : un réseau de racines peut compter des milliers de cases, mais le calcul ne se fait que lors des poses et des coupures, comme pour l'électricité. Les frondaisons se comptent par réseau (un total), pas par case.
  - Interface : une vue des racines (comme la vue électrique, touche K) avec la réserve de chaque réseau, une fenêtre de choix de mutation, l'ombre des frondaisons pendant la pose.
  - Bots : il faut leur apprendre à garder le réseau connexe (racines doublées), et choisir des mutations selon l'adversaire. Difficulté moyenne.
- **Taille : grosse.**

### Inspirations

Les mycorhizes (réseaux de champignons qui relient les arbres d'une forêt), la forêt toxique d'un célèbre film d'animation japonais, l'herbe rouge de *La Guerre des mondes*, les essaims extraterrestres des jeux de stratégie des années 1990 (sans leur tapis organique : ici le terreau n'est qu'un sol à bâtir). La Matrice est lamarckienne, clin d'œil assumé à Lamarck, que Darwin a détrôné partout sauf ici.

---

## 3. Les Diaphanes (lumière)

**Principe.** Des êtres de lumière : bâtiments et unités sont des projections d'énergie qui n'existent que tant qu'un prisme les alimente.

### Économie

- **Une seule monnaie, l'énergie**, gardée dans des **accumulateurs** : c'est leur réserve commune. Tout se paie en énergie, plus un peu de cristal (focalisation) et de silicium (lentilles) pour les projections avancées.
- **Produire de l'énergie** :
  - **Collecteurs** sur les geysers (deux fois le rendement d'une centrale géothermique) et sur le cristal (la meilleure source) ;
  - **Voiles** posées n'importe où (faible rendement) ;
  - **Capteurs** sur les gisements de fer, de cuivre, de silicium et d'hydrocarbure : ils dissolvent le minerai en énergie (transmutation, faible rendement) et envoient le silicium et le cristal par faisceau au prisme le plus proche. Pas de tapis ni de bras.
- **Prismes** au lieu de générateurs et de relais : ils créent un **champ** (la zone électrique des Industriels, avec les mêmes règles de liaison). Un prisme relié à au moins un collecteur ou à un accumulateur chargé est allumé.
- **Entretien** : chaque projection consomme de l'énergie en continu, bâtiment comme unité. La taille de l'armée est donc limitée par le revenu, pas par le stock. Quand les accumulateurs sont vides, les projections s'éteignent une à une, des plus récentes aux plus anciennes (identifiants décroissants).
- **L'EPPZ** (ruines des Anciens) vaut pour eux un accumulateur sans fond : c'est un objectif majeur sur la carte, à équilibrer à part (par exemple production divisée par deux pour cette race).

### Recherche

Pas de lots : la recherche ne consomme que de l'énergie, mais elle demande des **harmoniques**.

- Un **Résonateur** posé sur un site remarquable donne une note : geyser, gisement de cristal, ruine des Anciens, sommet (maximum local du relief), rivage.
- Chaque recherche demande un **accord** : un ensemble de notes différentes tenues en même temps. Exemple : la projection aérienne demande trois notes (geyser, sommet, rivage) ; les projections lourdes demandent la note de ruine, qu'on n'obtient qu'en tenant une ruine.
- L'arbre est donc organisé par accords plutôt que par paliers : les recherches simples demandent une ou deux notes faciles, les grandes recherches des notes rares. La recherche des Diaphanes dépend du contrôle de la carte, et un résonateur détruit au mauvais moment arrête la recherche en cours.

### Construction et production

- **Projection** : un bâtiment apparaît dans un champ allumé à mesure que l'énergie arrive ; le débit dépend de la puissance du prisme. L'**Éclat** (ouvrier) projette aussi, dans un petit champ qu'il porte.
- **Empreintes** : si le champ s'éteint, une projection devient une **empreinte**, sans PV, qui ne bloque plus le passage. Quand le champ revient, elle se rematérialise pour un quart de son coût. Une base coupée de son énergie ne meurt pas, elle s'efface.
- **Pas d'usines de sortie** : des **Foyers** (terrestre, aérien, naval) débloquent des types d'unités et fixent le débit de projection. L'unité apparaît au prisme allumé que le joueur choisit, n'importe où sur son réseau.
- **Repli** : on dissout une unité dans un champ et on récupère 80 % de son énergie, aussitôt. Une armée peut donc disparaître d'un front et réapparaître sur un autre, au rythme du débit de projection.
- **Hors champ**, une unité s'étiole (−2 % de PV par seconde). Les raids lointains demandent de déplacer des Porteurs, prismes mobiles qui emmènent le champ avec eux.

### Unités

| Projection | Rôle |
| --- | --- |
| **Le Luminaire** (commandement) | Ne peut pas être dissous. Porte un grand champ et projette lui-même. |
| **Éclat** | Ouvrier : projette les bâtiments, petit champ personnel. |
| **Lancier** | Unité de ligne bon marché, rayon à courte portée. |
| **Miroir** | Soutien : fait rebondir les tirs à énergie alliés sur une seconde cible, et renvoie 30 % des tirs à énergie ennemis. |
| **Porteur** | Prisme mobile : emmène le champ avec l'armée. |
| **Arc** | Artillerie à rayon prolongé (la famille d'armes de l'araignée de siège). |
| **Aurore** | Unité aérienne : une nappe de lumière qui réduit la vision ennemie dessous. |
| **Reflet** (eau) | Glisse sur l'eau, rapide. |

### Forces, faiblesses, contres

- **Forces** : mobilité stratégique (repli puis projection ailleurs), aucune logistique, une base coupée qui revient seule pour un quart du prix, boucliers et rayons.
- **Faiblesses** : entretien continu (garder une grosse armée coûte cher), dépend de la chaîne de prismes, s'étiole hors champ, recherche liée à des sites qu'il faut tenir. Ions et impulsions électromagnétiques : une projection paralysée subit le double des dégâts.
- **Bat** la Souche (leurs rayons comptent comme du feu) et les Sapeurs (les résonateurs détectent les vibrations des galeries ; une impulsion harmonique endommage ce qui est sous le champ).
- **Perd contre** les Copistes (−50 % aux armes à énergie) et les Transhumants (raids rapides contre les prismes, armée lourde qui écrase les projections légères).
- **Face aux Industriels** : le canon à ions et le bombardement des prismes les gênent ; ils gagnent en faisant apparaître l'armée là où l'autre n'est pas.

### Ce qu'il faut changer dans le code

- **Réseau** : les zones électriques existantes, presque telles quelles (prisme = classe `Pylon`).
- **Énergie** : `Player::energy` en entier sur 64 bits ; l'entretien est une somme gardée à jour quand une projection apparaît ou disparaît, pas recalculée à chaque tick.
- **Couverture** : une grille d'un bit par case et par joueur Diaphane, recalculée quand les zones changent (`power_dirty`) ; un test par unité et par tick pour l'étiolement.
- **Empreintes** : un état de bâtiment qui rend la case franchissable ; le secteur du champ de flux est recalculé (mécanisme existant).
- **Projection d'unités** : la sortie d'usine, placée au prisme choisi.
- **Harmoniques** : détection des sites (geysers, cristal, ruines, maxima du relief, rivages) au chargement de la carte.
- **Points délicats** :
  - Performance : une panne générale éteint d'un coup des centaines de bâtiments et fait recalculer beaucoup de secteurs. Il faut étaler l'extinction (par exemple 50 projections par tick, des plus récentes aux plus anciennes).
  - Déterminisme : l'ordre d'extinction et de rematérialisation suit les identifiants.
  - Interface : vue des champs (comme la vue électrique), choix du prisme de sortie, jauge d'entretien à côté de la réserve, carte des sites et des notes tenues.
  - Bots : les règles d'électricité existantes servent de base ; il faut leur apprendre l'entretien et le repli. Difficulté moyenne.
- **Taille : moyenne.**

### Inspirations

La « lumière solide » des hologrammes de science-fiction, les êtres d'énergie de nombreuses séries, le prisme de Newton, les vitraux. Les champs d'énergie nécessaires pour bâtir sont un clin d'œil à un grand jeu de stratégie spatiale, mais ici c'est l'armée elle-même qui s'éteint avec le champ. Diaphane, comme une aile de libellule.

---

## 4. Les Sapeurs (souterrain)

**Principe.** Un peuple de mineurs qui vit sous terre : il creuse des galeries pour extraire, se déplacer et faire s'effondrer les bases ennemies.

### Économie

- **Mêmes minerais que les Industriels**, mais extraits **en filon** :
  - Sous chaque case dort un filon pauvre (fer, cuivre ou silicium), dont la teneur est tirée de la position par `hash3`, sans toucher au générateur aléatoire de la carte.
  - Sous chaque gisement de surface, le filon est riche, avec sa pureté.
  - Une **haveuse** posée dans une galerie exploite le filon qu'elle traverse. Les Sapeurs extraient donc partout, lentement, et vite sous les gisements.
- **Trois étages** : fer et cuivre à −1, silicium à −2, cristal à −3. Les Sapeurs sont la seule race qui obtient du cristal sans aller dans les zones disputées, mais tard, après un long forage.
- **Galeries au lieu de tapis et de rails** : les minerais voyagent en **wagonnets** dans les galeries. Les galeries reprennent les rails et les trains des Industriels : graphe de voies, plus court chemin, gares de fond.
- **Air comprimé au lieu d'électricité** : les machines de fond marchent à l'air comprimé. Des **compresseurs** brûlent de l'hydrocarbure ; l'air passe par les galeries elles-mêmes. Une galerie est donc à la fois voie de transport et ligne d'énergie : une galerie effondrée coupe les deux.
- **Cheminées d'aération** : chaque réseau de galeries a besoin de cheminées en surface. Ce sont les points faibles visibles : une cheminée détruite fait baisser la pression de tout son réseau.
- **Magasin du fond** : la réserve commune, sous terre.

### Recherche

Les Sapeurs progressent par **carottage**.

- Un **Puits de forage** descend lentement. Chaque palier de recherche demande une profondeur atteinte (temps, et des étais en acier).
- Le puits remonte des **carottes**, des lots de recherche propres à chaque strate, que le laboratoire de fond consomme avec des produits de l'usine.
- L'arbre est en **strates** : chaque couche traversée ouvre une branche (strate du fer : machines ; strate du sel : explosifs ; strate de la silice : électronique ; strate du cristal : unités lourdes et expérimentale). Plus profond, plus puissant, mais plus lent.
- Le puits de forage est un bâtiment de surface, cible prioritaire pour l'adversaire. On peut en avoir plusieurs, chacun plus cher que le précédent.

### Construction et production

- **Galibots** : les ouvriers mineurs creusent les galeries (quelques cases par minute, moins vite sous le relief élevé, impossible sous l'eau sans la recherche d'étanchéité) et posent les machines de fond.
- **Bâtiments de fond**, sur une seconde grille, sous terre : haveuses, compresseurs, magasin, laboratoire, ateliers. Ils sont invisibles et inattaquables depuis la surface, sauf par les armes perforantes et après une détection sismique.
- **Bâtiments de jour**, en surface : puits d'accès, cheminées, puits de forage, tourelles escamotables.
- **Ateliers de fond** : ils produisent les unités, qui sortent par un **débouché**.
- **Débouchés** : un débouché se creuse en 30 s partout où une galerie arrive. Les unités voyagent dans les galeries comme une cargaison de wagonnet et ressortent par n'importe quel débouché : attaques surprises.
- **Sape** : une galerie creusée sous un bâtiment ennemi, plus une **charge de sape**, provoque un effondrement. Le bâtiment subit de gros dégâts et la case devient un cratère inconstructible pendant 2 min.

### Unités

| Unité | Rôle |
| --- | --- |
| **Le Maître-porion** (commandement) | Creuse, construit, combat à la pioche-canon. Il peut descendre sous terre, mais y reste repérable par la détection sismique de tous les adversaires, pour qu'une partie ne finisse pas en cache-cache. |
| **Galibot** | Ouvrier : creuse, pose les machines et les mines. |
| **Taupe** | Foreuse d'assaut : creuse vite une galerie provisoire et surgit sous sa cible ; corps-à-corps perforant. |
| **Mineur-grenadier** | Infanterie à explosifs : dégâts de zone, bonus contre les bâtiments. |
| **Tourelle escamotable** | Défense : sort de terre pour tirer, rentre et devient intouchable. |
| **Mortier de fond** | Artillerie qui tire depuis un débouché. |
| **Ver** (expérimentale) | Tunnelier géant : fore sous la carte et avale ce qu'il traverse en surgissant. |

Pas d'avions de combat : un ballon d'observation et des canons de puits (antiaérien escamotable) seulement. Pas de flotte : des galeries étanches passent sous l'eau.

### Forces, faiblesses, contres

- **Forces** : base invisible et protégée, mobilité souterraine et surprise, extraction partout dès le début, cristal sans zone disputée en fin de partie, sape contre les bases fixes.
- **Faiblesses** : quasiment pas d'aviation ni de flotte ; développement lent (creuser prend du temps) ; cheminées et puits de forage exposés ; les galeries s'effondrent sous les armes perforantes.
- **Bat** les Copistes (mines et explosifs de zone) et les Transhumants (mines sur leurs routes, sape sous les camps déployés).
- **Perd contre** la Souche (les racines profondes détectent les galeries) et les Diaphanes (les résonateurs captent les vibrations).
- **Face aux Industriels** : l'aviation et l'artillerie perforante les gênent ; ils gagnent en sapant une base qui ne bouge pas.

### Ce qu'il faut changer dans le code

- **Seconde grille d'occupation** pour le fond (un identifiant de bâtiment par case), créée seulement si un Sapeur joue. Elle ne touche pas les champs de flux de surface.
- **Galeries** : les rails, les gares et les trains existants, sous terre, et des zones d'air comprimé sur le modèle des zones électriques.
- **Unités sous terre** : retirées de la grille spatiale et du champ de flux (comme une unité transportée, `carried_by`) ; elles voyagent sur le graphe des galeries.
- **Visibilité** : les entités de fond sortent du tampon de rendu des adversaires, sauf détection sismique. Nouveau drapeau d'arme « perforante ».
- **Filons** : teneur par `hash3` de la position et de l'étage.
- **Sape, effondrement, cratères** : un ordre et un état de case temporaire.
- **Recherche par profondeur** : `Player::depth` et des lots par strate.
- **Points délicats** :
  - Victoire : le commandant ne doit pas pouvoir se cacher pour toujours (règle de détection ci-dessus).
  - Performance : la seconde grille pèse 4 Mo sur une carte de 20 km ; les unités sous terre coûtent moins cher qu'en surface (pas de champ de flux, pas de recherche de cibles).
  - Rendu : il faut une vue souterraine (une touche, comme K) qui montre les galeries en transparence ; la vue de dessus inclinée s'y prête.
  - Bots : planifier une sape est difficile. Un premier bot peut jouer défensif (extraire, miner, surgir près de sa base), et la sape viendra ensuite.
- **Taille : grosse.**

### Inspirations

*Germinal* de Zola (galibots, porions, coups de grisou), la guerre des mines de 1914-1918 (Vauquois, les Éparges, la Somme), les tunnels creusés pendant la guerre du Vietnam, les tunneliers, les vers géants des sables d'un célèbre roman, les nains mineurs des légendes et les Morlocks de H. G. Wells. Le sapeur, c'est d'abord le soldat du génie qui creuse la sape.

---

## 5. Les Transhumants (nomades)

**Principe.** Un peuple sans base fixe : toute l'industrie est montée sur d'immenses chenillards qui se déploient pour produire et se replient pour partir.

### Économie

- **Mêmes ressources et presque les mêmes recettes que les Industriels** : fer, cuivre, silicium, hydrocarbure, cristal, plaques, engrenages, circuits. Les données existantes resservent.
- **Chenillards** : des plateformes géantes qui portent une grille de **modules** (3 × 3 à 6 × 6 emplacements). Les modules sont des versions réduites des bâtiments existants : foreuse, fonderie, assembleur, générateur, laboratoire, atelier d'unités, tourelle, soute.
- **Pas de tapis ni de bras** :
  - Dans un chenillard, les modules collés se passent les objets par **transfert direct** et partagent comme des **machines jumelles** (règles existantes).
  - Entre chenillards, l'**arrimage** : deux chenillards déployés côte à côte s'arriment, et leurs modules en vis-à-vis se passent les objets de la même façon. Un convoi arrimé forme une base.
- **Électricité** : chaque chenillard porte ses générateurs ; un convoi arrimé forme un seul réseau. Pas de relais ni de zones au sol.
- **Réserve** : les **soutes** des chenillards. Celles d'un convoi arrimé sont communes ; un chenillard seul ne compte que sur la sienne.
- **Raclage** : une foreuse de Transhumant extrait deux fois plus vite qu'un extracteur, mais **appauvrit** le gisement pour son propriétaire (−10 % toutes les 5 min, jusqu'à −60 %). Le gisement se reconstitue quand on le laisse. Les Transhumants doivent changer de pâturage : c'est la transhumance.

### Recherche

Pas de lots fabriqués : les Transhumants progressent par **relevés**.

- Points de relevé : chaque case nouvellement explorée par l'équipe, chaque gisement ou geyser relevé (un éclaireur stationné 5 s), chaque ruine, chaque épave ennemie inspectée, et un bonus quand l'Arche s'installe dans une région où elle n'a jamais campé.
- Les laboratoires (modules) convertissent les relevés, plus un peu de matière, en avancement.
- L'arbre est proche de celui des Industriels, mais payé en relevés : rester chez soi bloque la recherche, explorer la fait avancer.

### Construction et production

- **L'Arche** (commandement) : un chenillard géant et lent, avec une grande soute, une grue et un petit atelier. Sa destruction élimine le joueur.
- **Châssis** : l'atelier de l'Arche produit des châssis vides, que la grue (ou des drones tirés de la soute) équipe de modules.
- **Déploiement** : 15 s pour se déployer (le chenillard s'ancre, ses modules se mettent en marche), 10 s pour se replier (ses modules s'arrêtent, il garde ses stocks). Replié, il ne produit rien et n'a pas de bouclier ; déployé, il ne bouge pas.
- **Atelier roulant** (recherche avancée) : un chenillard peut produire en roulant, à moitié de sa vitesse.
- **Pas de défenses fixes au sol**, sauf les tourelles des chenillards déployés et des mines.

### Unités

| Unité | Rôle |
| --- | --- |
| **L'Arche** (commandement) | Base mobile géante, lente, très résistante. |
| **Chenillard** (trois tailles) | Châssis à modules : usine, mine, centrale ou forteresse selon ce qu'on y monte. |
| **Pisteur** | Éclaireur rapide qui fait les relevés. |
| **Cavalier** | Char rapide qui tire en roulant ; escorte et raids. |
| **Canon tracté** | Artillerie à longue portée qui se met en batterie en 3 s. |
| **Bélier** | Chenillard d'assaut sans modules : éperonne et fait de gros dégâts aux structures fixes. |
| **Dirigeable** | Base aérienne lente, porte deux modules (dont un atelier aérien). |
| **Barge** (eau) | Chenillard amphibie, pas de vraie marine. |

### Forces, faiblesses, contres

- **Forces** : on ne peut pas raser sa base en un raid, elle s'en va ; elle prend les meilleurs gisements où qu'ils soient ; chenillards très résistants ; armée qui frappe les bases fixes.
- **Faiblesses** : production arrêtée pendant les déplacements ; peu de défenses ; l'Arche est grosse et facile à repérer ; le raclage l'oblige à bouger ; marine faible.
- **Bat** les Copistes (canons cinétiques lourds, et une base qui part quand on veut la manger) et les Diaphanes (raids rapides contre les prismes).
- **Perd contre** la Souche (les lianes immobilisent les chenillards) et les Sapeurs (mines sur les routes, sape sous les camps).
- **Face aux Industriels** : l'artillerie lourde punit un convoi déployé ; les Transhumants gagnent en allant prendre les gisements éloignés que l'autre ne peut pas défendre.

### Ce qu'il faut changer dans le code

- **Bâtiments qui deviennent des unités** : c'est le point dur. Proposition : au repli, les modules sortent de la grille et deviennent la cargaison du chenillard (type, recette, stocks, avancement, sauvegardés) ; au déploiement, on vérifie que l'emprise est libre et plane, puis on recrée les bâtiments (nouveaux identifiants, attribués dans l'ordre). Déplacer des bâtiments sur la grille à chaque tick n'est pas envisageable.
- **Champs de flux** : chaque déploiement et chaque repli fait recalculer les secteurs touchés (mécanisme existant). Les temps de déploiement limitent la fréquence.
- **Arrimage** : un test de contact entre chenillards déployés, qui réutilise le transfert direct et les jumelles.
- **Raclage** : un compteur d'usure par gisement et par joueur (`Spot::wear`).
- **Relevés** : la grille d'exploration par équipe existe ; on compte les cases qui passent à « explorée ».
- **Points délicats** :
  - Déterminisme : l'ordre de recréation des modules et l'attribution des identifiants doivent être fixes (ordre des emplacements dans le châssis).
  - Performance : un repli ou un déploiement de 36 modules coûte un recalcul de secteurs ; il faudra le mesurer avec 8 Transhumants qui bougent en même temps.
  - Interface : un petit éditeur de modules par chenillard, un aperçu de l'emprise au déploiement, l'usure des gisements.
  - Bots : choisir un campement et décider quand migrer est difficile. Difficulté élevée.
- **Taille : grosse**, et la plus risquée des cinq.

### Inspirations

Les villes mobiles des romans post-apocalyptiques, la transhumance des bergers (le nom), les caravanes de la route de la soie, les yourtes qu'on démonte en une heure, le vaisseau-mère d'un jeu de stratégie spatiale de 1999 et l'usine mobile de Supreme Commander, déjà présente dans le jeu sous le nom de forteresse marchante.

---

## Tableau comparatif

| | Industriels (actuels) | Copistes | Souche | Diaphanes | Sapeurs | Transhumants |
| --- | --- | --- | --- | --- | --- | --- |
| **Ressources** | 5 minerais, chaînes de produits | Masse (fer, cuivre), noyaux (silicium), matrices (cristal) | Sève (frondaisons, hydrocarbure), sels (minerais), ADN | Énergie, un peu de silicium et de cristal | 5 minerais, en filons sur 3 étages | 5 minerais, chaînes de produits |
| **Transport** | Tapis, bras, trains | Aucun : la matière marche | Réseaux de racines (une réserve par réseau) | Faisceaux des capteurs | Wagonnets dans les galeries | Transfert direct, arrimage |
| **Énergie** | Zones électriques, combustible | Aucune | La sève | Prismes et champs | Air comprimé par les galeries | Générateurs embarqués |
| **Réserve** | Dépôts, commune | Dans les unités, Ruches | Par réseau, Bulbes | Accumulateurs | Magasin du fond | Soutes, communes si arrimées |
| **Recherche** | Labos et lots, 6 paliers | Rétro-ingénierie (épaves), 5 branches | Évolution à choix exclusifs, caractères acquis | Harmoniques (sites tenus), accords | Carottage, strates | Relevés (exploration) |
| **Construction** | Drones ingénieurs | Figement et dégel | Graines qui poussent | Projection, empreintes | Galibots, deux grilles | Modules sur châssis |
| **Production** | Usines | Scission | Couveuses, œufs | Foyers, sortie à n'importe quel prisme | Ateliers de fond, débouchés | Ateliers embarqués |
| **Combat, trait marquant** | Polyvalence | Le combat fait grossir | Régénération, adaptation | Repli et reprojection | Surprise, sape | Base qui bouge |
| **Bat** | — | Souche, Diaphanes | Sapeurs, Transhumants | Souche, Sapeurs | Copistes, Transhumants | Copistes, Diaphanes |
| **Perd contre** | — | Sapeurs, Transhumants | Copistes, Diaphanes | Copistes, Transhumants | Souche, Diaphanes | Souche, Sapeurs |
| **Coût de simulation** | Référence | Plus faible | Proche | Proche | Plus faible sous terre | Pics aux déploiements |
| **Difficulté pour les bots** | Existant | Faible | Moyenne | Moyenne | Élevée | Élevée |
| **Taille** | — | Moyenne | Grosse | Moyenne | Grosse | Grosse |

Chaque nouvelle race en bat deux et perd contre deux : le cercle est fermé, aucune n'est dominante. Les Industriels restent la race polyvalente : ils ont une réponse contre chacune (disrupteur et artillerie contre les Copistes, souffle de feu contre la Souche, canon à ions contre les Diaphanes, aviation contre les Sapeurs, artillerie lourde contre les Transhumants), sans avoir d'avantage net.

## Ordre de réalisation recommandé

0. **Le socle commun** (ci-dessous), en faisant des Industriels la race 0. Rien ne change pour le joueur, mais tout ce qui suit en dépend.
1. **Les Copistes** (moyenne). Race demandée ; elle réutilise la récolte du commandant, le recyclage des épaves et les règles des réplicateurs ; elle n'a ni tapis ni électricité, donc elle vérifie que le socle tient une race très différente. Le bot est simple à écrire.
2. **La Souche** (grosse). Race demandée ; elle oblige à rendre générique le calcul des zones électriques (réseaux avec réserve), qui servira ensuite aux Diaphanes et aux Sapeurs. Elle donne aussi un usage nouveau à la faune (domestication).
3. **Les Diaphanes** (moyenne). Rapide une fois les réseaux génériques posés ; elle apporte la ressource non matérielle et l'entretien.
4. **Les Sapeurs** (grosse). Seconde grille et vue souterraine : beaucoup de travail neuf, mais isolé du reste ; les galeries réutilisent rails et trains.
5. **Les Transhumants** (grosse). La plus risquée pour la performance (bâtiments qui deviennent des unités) et pour les bots. À faire en dernier, après une mesure au banc d'un prototype de déploiement et de repli.

Chaque race peut sortir d'abord en version réduite : son économie, son commandant, quatre ou cinq unités, sans expérimentale ni unités navales, puis s'étoffer.

## Socle commun à poser d'abord

1. **Race du joueur** : `Player::race` (sauvegarde version 3) ; choix de la race par emplacement dans le salon (avec « au hasard », tiré par le serveur avant le lancement pour rester hors de la simulation), ordre `setRace` dans le protocole, paramètre d'init par joueur, méta de sauvegarde et replays.
2. **Données par race** : un champ `race` sur `BuildingDef`, `UnitDef` et `TechDef` (ou un masque de bits pour ce qui est partagé, comme le mur ou le radar). `orders.rs` refuse la pose d'un bâtiment ou la production d'une unité d'une autre race. Un kit de départ par race (commandant, bâtiments de départ, stock initial) au lieu du générateur principal et des 20 hydrocarbures écrits en dur.
3. **Recherche** : `researched: u64` est plein à 48 recherches sur 64 ; le passer à un ensemble de bits plus grand (`[u64; 4]`, 256 recherches). Un arbre par race ; le panneau de recherche du client devient générique (paliers, branches, accords ou strates selon la race), et la façon de payer la recherche (lots, schémas, ADN, harmoniques, carottes, relevés) devient une règle de race.
4. **Commandant générique** : un drapeau `commander` sur `UnitDef` au lieu de `U_COMMANDER` en dur (19 usages dans `sim/src/`) : victoire, explosion finale, bots, interface.
5. **Familles de dégâts et armures** : une famille par arme (cinétique, énergie, explosif, feu et acide, ions), déduite de `Proj` avec un champ pour les exceptions, et une classe d'armure par unité et par bâtiment, avec une table de multiplicateurs en ‰. `kinetic` et `replicator_damage` (`nature.rs`) deviennent des cas de cette table.
6. **Réseaux génériques** : l'algorithme des zones électriques rendu générique (connecteurs, liaisons, réserve par réseau, partage à la coupure), pour les racines, les prismes et l'air comprimé. À faire avec la Souche, sans changer le comportement de l'électricité (le test de déterminisme doit garder le même hash pour une partie d'Industriels).
7. **Client** : barre de construction et fiches filtrées par race ; modèles dans `assets/models/<race>/`, décrits en pièces comme aujourd'hui, avec une identité visuelle par race (briques gris argent pour les Copistes, formes rondes vert et brun pour la Souche, prismes translucides et lumineux pour les Diaphanes, chevalements et étais en bois pour les Sapeurs, chenilles et toiles ocre pour les Transhumants).
8. **Bots** : un champ `race` dans le bot et un module de builders par race (`packages/server/src/bots/races/`). Tant qu'une race n'a pas son bot, le salon ne la propose pas aux bots.
9. **Banc et équilibrage** : le banc de performance avec des races mêlées (8 joueurs, une race chacun), un test de déterminisme par race, et des duels automatiques race contre race à graine fixe, sans affichage, pour suivre les taux de victoire à chaque modification d'équilibrage.

Taille du socle : moyenne. Le plus long est la recherche générique et l'interface du salon et de la barre de construction.
