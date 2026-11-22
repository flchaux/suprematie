# Les Copistes : règles détaillées

Nov 22, 2026 · document de conception, complète la section Copistes de [races.md](races.md). Rien n'est codé.

Les chiffres sont des valeurs de départ, calées sur celles des Industriels (un robot de ligne coûte environ 6 minerais pour 200 PV ; un extracteur de base sort 0,5 minerai par seconde). Ils seront fixés pendant l'équilibrage.

## L'idée en trois phrases

1. Un Copiste n'est pas une unité fabriquée par une usine : c'est un tas de briques qui marche, qui grossit en mangeant du minerai et qui se coupe en deux quand il est assez gros.
2. Le joueur ne gère donc pas des chaînes de production mais une population : il la nourrit (fer et cuivre), la multiplie (silicium) et lui donne des formes (recherche).
3. Tout ce qui existe chez les Copistes, unités comme bâtiments, est de la masse qu'on peut reprendre : un mur peut repartir à l'attaque, un essaim peut se figer en tourelle, une armée blessée peut fusionner pour repartir entière.

## Vocabulaire

| Terme | Sens |
| --- | --- |
| **Brique** | Unité de masse. Une brique vaut un minerai de fer ou de cuivre. |
| **Assemblage** | Toute entité des Copistes : une unité (assemblage mobile) ou un bâtiment (assemblage figé). |
| **Masse** | Nombre de briques d'un assemblage. Les PV, les dégâts et la taille à l'écran en dépendent. |
| **Noyau** | Le « cerveau » d'un assemblage. Chaque noyau tient un nombre maximal de briques ; un assemblage peut en avoir plusieurs. |
| **Silice** | Ce que donne le silicium brouté. Il faut de la silice pour fabriquer un noyau. |
| **Forme** | Le corps que prend un assemblage mobile : Brouteur, Essaim, Lanceur, Tisseur, Nuée ailée, Radeau, Agrégat. |
| **Figement** | Un assemblage qui s'immobilise en bâtiment : mur, tourelle, Ruche, Calculateur, Vigie. |
| **Schéma** | Point de recherche, gagné en mangeant une épave ou en faisant travailler un Calculateur. |

## Masse et points de vie

- Les PV d'un assemblage valent sa masse multipliée par les PV par brique de sa forme (tableau des formes plus bas). Un essaim de 8 briques a 8 × 25 = 200 PV, comme un robot de ligne.
- Les dégâts suivent la masse aussi : un essaim de 16 briques frappe deux fois plus fort qu'un essaim de 8.
- **Perdre des PV, c'est perdre des briques.** Les dégâts sont comptés en PV, et la masse est recalculée : masse = PV restants ÷ PV par brique, arrondi au-dessus. Un essaim à moitié détruit frappe deux fois moins fort. C'est la grande différence avec les autres races, dont une unité blessée tire aussi fort qu'une unité neuve.
- **Réparer, c'est rendre des briques.** Un assemblage blessé qui broute, fusionne ou reçoit des briques d'un Tisseur retrouve ses PV.
- **Mort** : un assemblage détruit laisse une épave qui contient la moitié de sa masse. Tout le monde peut la recycler, y compris l'adversaire (les drones ingénieurs des Industriels en tirent des plaques de fer). Il faut donc rester maître du champ de bataille pour récupérer ses pertes.

## Économie

### Brouter le fer et le cuivre

- Un **Brouteur** posé à moins de 3 cases d'un gisement de fer ou de cuivre le mange : 0,5 brique par seconde, multiplié par la pureté du gisement (0,25 sur un gisement impur, 1 sur un pur). C'est le débit d'un extracteur de base, sans électricité ni fonderie.
- Le **Noyau-mère** broute aussi, deux fois moins vite, comme la récolte du commandant des Industriels.
- **Plafond par gisement** : un gisement ne donne pas plus de 1 brique par seconde (× pureté), quel que soit le nombre de brouteurs. Au-delà de deux brouteurs, le débit est partagé. On ne peut pas empiler cinquante brouteurs sur un gisement.
- Les briques vont dans le Brouteur lui-même, jusqu'à la capacité de ses noyaux. Un Brouteur plein s'arrête. Pour vider un Brouteur, trois façons :
  1. une **scission** : il se coupe en deux, et sa moitié part faire autre chose ;
  2. une **fusion** avec un autre assemblage ;
  3. un **dépôt** dans une **Ruche** collée au gisement (un ordre automatique : un Brouteur plein à côté d'une Ruche y vide sa masse jusqu'à sa taille minimale).
- Bilan : un Brouteur qui travaille est une petite usine à briques ; une Ruche sur un gisement est l'équivalent de l'extracteur et du dépôt des Industriels.

### Brouter le silicium : la silice et les noyaux

- Un Brouteur sur un gisement de silicium ne gagne pas de briques : il remplit la **silice** du joueur, un compte global comme les fragments d'énergie (0,25 par seconde au même débit). C'est une exception voulue à la règle « la matière est dans les unités » : la silice sert à décider quand se multiplier, et la répartir à la main entre des centaines d'unités serait une corvée.
- Un **noyau** coûte 4 silice. Il est fabriqué au moment d'une scission (voir plus bas).
- Chaque noyau tient au plus **60 briques**, puis 90 et 120 par la recherche (branche Noyaux). Un assemblage de deux noyaux tient 120 briques au départ.
- La silice est donc le vrai frein à la croissance : avec 4 gisements de fer et de cuivre et 1 de silicium, un Copiste a de quoi faire grossir ses assemblages bien plus vite qu'il ne peut en faire de nouveaux.

### Le cristal : les matrices

- Un Brouteur sur un gisement de cristal fabrique des **matrices** (compte global, 1 toutes les 20 s). Les formes avancées en demandent : une Nuée ailée lourde, un Agrégat, une tourelle lourde. Le cristal reste dans les zones disputées, comme pour les Industriels.

### Ce dont les Copistes se passent

- **Hydrocarbure** : aucun usage. Les Copistes n'ont pas d'électricité ; chaque brique porte son énergie. Ils peuvent occuper ou raser les gisements d'hydrocarbure dont l'adversaire a besoin.
- **Tapis, bras, trains** : la matière se déplace en marchant (scission puis déplacement, fusion à l'arrivée) ou par les Tisseurs.
- **Réserve commune** : il n'y en a pas, sauf pour la silice et les matrices. Les Ruches sont des réserves locales.

## Les formes

Un assemblage mobile a toujours une forme. Changer de forme (**reformage**) prend 10 s, sur place, sans perte de masse. La forme doit être recherchée.

| Forme | Masse minimale | PV par brique | Vitesse | Arme et rôle |
| --- | --- | --- | --- | --- |
| **Noyau-mère** (commandement) | 40 (départ : 80) | 4 000 + 40 par brique | 22 (comme le commandant) | Canon à briques (cinétique, portée 18). Broute à demi-débit, fabrique les noyaux deux fois plus vite, fige et dégèle comme un Tisseur. Ne se scinde pas, ne fusionne pas, ne se fige pas. Unique : sa destruction élimine le joueur. |
| **Brouteur** | 10 | 15 | 26 | Sans arme. Broute gisements et épaves. |
| **Essaim** | 6 | 25 | 30 | Désassembleur au corps-à-corps (voir plus bas). L'unité de ligne. |
| **Lanceur** | 12 | 15 | 26 | Projette des briques, arme cinétique à portée 18 : 60 dégâts toutes les 2 s, une brique par tir. Ne tire plus quand il atteint sa masse minimale. |
| **Tisseur** | 10 | 15 | 32 | Fige et dégèle deux fois plus vite que les autres. Donne ses briques à un assemblage blessé (2 par seconde, à 6 cases) : c'est la réparation. Transfère de la masse entre deux assemblages. |
| **Nuée ailée** | 8 | 12 | 120, volante | Attaque le sol et l'air, au contact. Coûteuse : un noyau ne tient que 20 briques dans cette forme. |
| **Radeau** | 20 | 25 | 35, sur l'eau | Navire : canon à briques. Se forme seulement au bord de l'eau. |
| **Agrégat** (avancé) | 200 | 30 | 18 | Écrase les unités légères en marchant dessus, désassembleur en zone. Demande 1 matrice par tranche de 100 briques. |

Taille à l'écran : le rayon suit la racine carrée de la masse, entre 0,4 case (6 briques) et 3 cases (1 000 briques). On voit d'un coup d'œil qui est gros.

## Se multiplier : scission, fusion, reformage

### Scission

- Ordre « Scinder » (raccourci S). Conditions : masse au moins égale à deux fois la masse minimale de la forme, et soit 4 silice dans la réserve du joueur, soit au moins deux noyaux dans l'assemblage.
- Durée : 20 s. Pendant ce temps, l'assemblage est immobile, ne tire pas et subit 25 % de dégâts en plus.
- Résultat : deux assemblages de même forme, chacun avec la moitié de la masse (la brique impaire reste dans l'original). Si l'original n'avait qu'un noyau, un noyau neuf est fabriqué avec la silice ; s'il en avait plusieurs, il en cède la moitié à la copie, gratuitement.
- La copie apparaît collée à l'original, du côté libre le plus proche de son point de ralliement.
- **Scission continue** (case à cocher sur la fiche, ou Maj+S) : l'assemblage se scinde dès qu'il peut, et envoie chaque copie à son point de ralliement. Un Brouteur en scission continue sur un gisement devient une source d'unités sans intervention du joueur : c'est l'équivalent d'une usine en production répétée.

### Fusion

- Ordre « Fusionner » (raccourci F) sur deux assemblages mobiles de même forme ou plus. Ils marchent l'un vers l'autre et fusionnent au contact en 2 s.
- Le résultat garde le plus petit identifiant, additionne les masses et les noyaux. La masse au-delà de la capacité des noyaux est perdue (l'interface prévient avant).
- Usages : regrouper des blessés en une unité entière, vider des Brouteurs dans un essaim, faire un Agrégat.
- Sur une sélection de plus de deux assemblages, ils fusionnent deux à deux par identifiant croissant jusqu'à n'en faire qu'un.

### Reformage

- Ordre « Reformer » (raccourci R, puis la forme). 10 s, sur place, sans perte de masse. Si la masse est inférieure à la masse minimale de la nouvelle forme, l'ordre est refusé.
- Un groupe d'essaims qui a gagné un combat peut redevenir des Brouteurs pour manger les épaves, puis redevenir des essaims.

## Le désassembleur

- C'est l'arme des Essaims et de l'Agrégat : une attaque au corps-à-corps qui fait 3 dégâts par brique de l'essaim par seconde (un essaim de 8 briques : 24 dégâts par seconde).
- **Contre une cible mécanique** (unités et bâtiments des Industriels, des Transhumants, des Sapeurs, et les autres Copistes) : un quart des dégâts faits revient à l'essaim en briques, à raison d'une brique pour 25 PV arrachés. Un essaim qui détruit un char léger (550 PV) gagne environ 5 briques.
- **Contre une cible vivante ou de lumière** (Souche, Diaphanes, faune biologique) : pas de gain.
- Le gain s'arrête à la capacité des noyaux de l'essaim. Un essaim plein frappe normalement mais ne grossit plus.
- Garde-fou : la masse gagnée ne peut pas dépasser la moitié de la masse de la cible. Une cible très résistante (bouclier, blindage) ne nourrit pas l'essaim plus qu'elle ne pèse.

## Les figements (bâtiments)

- Ordre « Figer » (raccourci G), puis la forme du bâtiment et son emplacement : l'assemblage s'y rend et s'immobilise. Durée : 1 s pour 4 briques (Tisseur et Noyau-mère : deux fois plus vite).
- Le bâtiment garde toute la masse de l'assemblage ; la masse au-delà de ce que le bâtiment peut contenir reste dans un assemblage mobile qui se détache (une scission gratuite, sans silice, puisque le bâtiment n'a pas besoin de noyau).
- Ordre « Dégeler » sur un bâtiment : il redevient un assemblage mobile de forme Essaim avec 90 % de sa masse, en 5 s. Un bâtiment blessé rend la masse de ses PV restants.

| Figement | Taille | Masse | PV par brique | Rôle |
| --- | --- | --- | --- | --- |
| **Mur** | 1 × 1 | 20 | 60 | Bloque le passage et les tirs directs. |
| **Tourelle** | 2 × 2 | 40 à 120 | 40 | Canon à briques (cinétique, portée 22) ; dégâts selon la masse. Ne consomme pas de briques en tirant. |
| **Tourelle lourde** (recherche, 1 matrice) | 2 × 2 | 150 à 300 | 40 | Canon long, portée 30. |
| **Ruche** | 2 × 2 | 40 + ce qu'elle garde | 40 | Réserve locale de 600 briques. Les Brouteurs collés y déposent ; un assemblage qui la touche peut y puiser (ordre « Puiser »). |
| **Calculateur** | 2 × 2 | 50 | 30 | Digère 1 brique toutes les 4 s et produit un schéma de la famille choisie toutes les 30 briques. |
| **Vigie** | 1 × 1 | 15 | 20 | Vision et radar (rayon 50). |
| **Cale** | 3 × 3, au bord de l'eau | 60 | 40 | Requise pour reformer en Radeau. |

Les figements n'ont besoin ni d'électricité ni d'entretien. Un Copiste peut couvrir une zone de tourelles en quelques secondes s'il a la masse sur place, et la reprendre quand la menace est passée.

## Recherche par rétro-ingénierie

### Gagner des schémas

- **Manger une épave** (Brouteur ou Essaim reformé, ordre « Brouter » sur l'épave) : on récupère la masse (1 brique par 25 PV de l'unité d'origine, au plus la moitié de son coût en minerai) et des **schémas** de la famille de l'unité :
  - unité terrestre : 1 schéma terrestre, plus 1 par palier au-dessus du premier ;
  - appareil : schémas « ailes » ; navire : schémas « coques » ;
  - bâtiment détruit par un Copiste (il laisse une épave pour les Copistes seulement) : schémas « figements » ;
  - unité ou bâtiment qui contient du cristal (cristal raffiné, cellule d'énergie, matrice) : 1 schéma « cristallin » de plus ;
  - expérimentale : 10 schémas ;
  - réplicateur de la faune : schémas doublés.
- **Faire travailler un Calculateur** : 1 schéma toutes les 30 briques digérées (2 minutes), de la famille qu'on lui choisit.

### L'arbre

Cinq branches, quatre niveaux chacune. Un niveau coûte 5, 15, 40, puis 100 schémas de sa famille, et 20 s à 2 min d'étude (dans le Noyau-mère, une étude à la fois, avec une file comme la recherche des Industriels).

| Branche | Niveau 1 | Niveau 2 | Niveau 3 | Niveau 4 |
| --- | --- | --- | --- | --- |
| **Formes terrestres** (schémas terrestres) | Lanceur | Tisseur rapide, désassembleur +25 % | Agrégat | Agrégat : écrasement des unités moyennes |
| **Ailes** (schémas ailes) | Nuée ailée | Nuée qui porte un essaim (transport) | Nuée lourde (matrices) | Nuée de bombardement (largue des briques en zone) |
| **Coques** (schémas coques) | Cale et Radeau | Radeau rapide | Radeau sous-marin | Radeau lourd |
| **Figements** (schémas figements) | Tourelle | Vigie, Ruche agrandie | Tourelle lourde | Figement et dégel instantanés pour les Tisseurs |
| **Noyaux** (schémas cristallins, ou 3 schémas d'une autre famille pour 1) | Capacité 90 | Scission en 12 s | Capacité 120 | Résistance aux dégâts de zone (−25 %) |

Au départ, les Copistes ont le Brouteur, l'Essaim, le Mur, la Ruche et le Calculateur.

Le Calculateur rend la recherche possible sans combattre, mais lente : un niveau 2 (15 schémas) lui demande une demi-heure de travail. Les épaves en donnent bien plus vite. Le jeu des Copistes pousse donc à provoquer des combats qu'on gagne, et à rester sur le champ de bataille pour le nettoyer.

## Déroulé d'une partie type

**Départ** : le Noyau-mère (80 briques), deux Brouteurs de 10 briques, 20 silice. Aucun bâtiment.

- **0 à 3 min** : les deux Brouteurs vont sur le fer et le cuivre, en scission continue. Le Noyau-mère broute le silicium. Vers 1 min, chaque Brouteur a 20 briques et se scinde ; vers 3 min, il y en a 6 à 8. On fige une Ruche sur chaque gisement.
- **3 à 8 min** : les copies deviennent des Essaims. Premier raid sur les extracteurs et les tapis de l'adversaire : un Essaim qui mange un extracteur grossit. Un Calculateur tourne sur la branche Formes terrestres.
- **8 à 15 min** : premier vrai combat. Le Copiste gagne s'il garde le terrain : ses blessés fusionnent, ses Brouteurs mangent les épaves, il passe au Lanceur et aux tourelles. S'il perd, l'adversaire recycle ses épaves et il a nourri l'ennemi.
- **Après 15 min** : capacité des noyaux, Agrégats pour casser les lignes fixes, Nuées ailées contre l'artillerie, cristal pour les matrices.

## Comment jouer contre eux

- **Industriels** : tenir le terrain avec de l'artillerie (cinétique, dégâts de zone +50 %) et des disrupteurs ; recycler les épaves avant eux ; protéger le silicium. Les tourelles légères suffisent contre les petits essaims, pas contre un Agrégat.
- **Souche** : l'acide ne fait rien. Il faut les Carapaces (corps-à-corps sans gain pour l'essaim, puisqu'elles sont vivantes) et digérer les épaves sur son terreau avant eux.
- **Diaphanes** : leurs armes à énergie font moitié moins de dégâts. Il faut se replier, et frapper les Brouteurs isolés.
- **Sapeurs** : mines et grenades (dégâts de zone) sous les gros groupes ; sape sous les Ruches.
- **Transhumants** : canons cinétiques lourds, et partir quand l'essaim arrive : une base repliée ne se mange pas.

## Résistances

| Famille de dégâts | Effet sur un Copiste |
| --- | --- |
| Cinétique (balles, obus, rail) | normal |
| Énergie (plasma, traits, lasers) | −50 % |
| Explosifs et dégâts de zone (obus de zone, bombes, missiles, grenades) | +50 % |
| Feu, acide, poison | aucun effet |
| Ions, paralysie | normal |
| Disrupteur des Industriels | ×3 |

## Garde-fous contre l'emballement

La croissance exponentielle est le cœur de la race et son risque. Ces règles la bornent :

1. **Plafond par gisement** (1 brique par seconde au plus) : la masse dépend de la carte tenue, pas du nombre d'unités.
2. **Silice** : chaque nouvel assemblage coûte 4 silice, et le silicium est rare.
3. **Scission lente et vulnérable** : 20 s immobile avec 25 % de dégâts en plus.
4. **Gain du désassembleur plafonné** : capacité des noyaux, et pas plus de la moitié de la masse de la cible.
5. **Épaves partagées** : la moitié de la masse d'un mort reste sur le terrain, et l'adversaire peut la recycler.
6. **Limite d'unités** : 1 000 assemblages par joueur, comme pour les autres races. Un joueur qui l'atteint fusionne.

## Interface

- **Au-dessus de chaque assemblage** : une barre de masse (masse sur capacité) au lieu de la barre de PV, et un point par noyau.
- **Réserve** : silice et matrices à la place des objets ; le nombre d'assemblages et la masse totale.
- **Fiche d'un assemblage** : forme, masse, noyaux, capacité ; boutons Scinder (et case « scission continue »), Fusionner, Reformer (menu des formes recherchées, grisées si la masse ne suffit pas), Figer (menu des figements), et la file d'étude pour le Noyau-mère.
- **Aperçu de figement** : l'emprise, la masse qui sera prise et celle qui se détachera.
- **Raccourcis** : S scinder, Maj+S scission continue, F fusionner, R reformer, G figer, D dégeler.
- **Panneau de recherche** : les cinq branches avec le nombre de schémas de chaque famille, et ce que la prochaine épave visible rapporterait (au survol d'une épave).
- **Modèles 3D** : des assemblages de cubes gris argent, plus ou moins nombreux selon la masse (paliers de modèle à 6, 20, 60, 200 et 600 briques, pour ne pas recalculer un modèle à chaque brique).

## Bots

Les Copistes sont la race la plus simple à faire jouer par un bot :

- Brouteurs en scission continue sur tous les gisements tenus ; une Ruche par gisement.
- Garder 8 silice d'avance pour les scissions ; envoyer le Noyau-mère sur le silicium quand il n'a rien d'autre à faire.
- Un peloton d'essaims attaque quand sa masse totale dépasse une fois et demie la valeur estimée de l'armée adverse visible.
- Après un combat gagné : fusionner les blessés, reformer en Brouteurs les essaims pleins, manger les épaves.
- Figer des tourelles sur les gisements menacés, les dégeler quand la menace est partie.
- Choisir les branches de recherche selon les épaves disponibles.

## Ce qu'il faut changer dans le code

| Étape | Fichiers | Contenu |
| --- | --- | --- |
| 1. Masse | `world.rs`, `ser.rs`, `save.rs` | `UnitCold::mass`, `UnitCold::cores`, `Building::mass` ; PV, dégâts et rayon calculés d'après la masse et la forme ; sauvegarde. |
| 2. Formes | `data.rs` | Une `UnitDef` par forme, avec un champ `brick_hp` ; une table des figements. Silice et matrices dans le stock du joueur (deux objets de plus). |
| 3. Brouter | `units.rs` | La récolte du commandant (`Order::Harvest`, `HARVEST_*`) généralisée : débit par forme, plafond par gisement (un compteur par gisement et par tick), dépôt dans les Ruches. |
| 4. Ordres | `orders.rs`, `packages/shared/src/orders.ts` | `O_SPLIT`, `O_MERGE`, `O_REFORM`, `O_FREEZE`, `O_THAW`, `O_DRAW` (puiser) ; validation (forme, masse, silice). |
| 5. Désassembleur | `combat.rs`, `data.rs` | Une arme qui rend une partie de ses dégâts en masse au tireur, avec les plafonds. |
| 6. Épaves | `units.rs`, `buildings.rs` | Épaves des assemblages (moitié de la masse) ; épaves de bâtiments pour les Copistes ; schémas en les mangeant. |
| 7. Recherche | `world.rs`, `data.rs` | Compteurs de schémas par famille ; arbre de 5 × 4 études dans `TECHS`, payé en schémas. |
| 8. Client | `packages/client` | Barre de masse, fiche, raccourcis, aperçu de figement, panneau de recherche ; modèles dans `assets/models/copistes/`. |
| 9. Bots | `packages/server/src/bots/races/copistes.ts` | Les règles ci-dessus. |

Tests à écrire (`sim/src/copistes_tests.rs`) : scission (masse, noyaux, silice), fusion (plafond, identifiant gardé), reformage refusé si la masse manque, plafond par gisement avec trois brouteurs, gain du désassembleur et ses deux plafonds, figement puis dégel (90 %), épave d'un assemblage, schémas d'une épave de chaque famille, déterminisme d'une partie avec un Copiste contre un bot Industriel.

Taille : moyenne. Le socle commun (race du joueur, données par race, recherche générique, familles de dégâts) doit exister avant.
