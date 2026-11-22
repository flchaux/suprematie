# Races jouables

> Partie de la spécification. Index et liste des fichiers : [docs/SPEC.md](../SPEC.md).

Trois races sont jouables : les **Industriels** (la faction d'origine, décrite dans les autres fichiers), la **Souche** et les **Transhumants**. Les propositions de départ, et les trois races pas encore réalisées (Copistes, Diaphanes, Sapeurs), sont dans [docs/propositions/races.md](../propositions/races.md).

La Souche et les Transhumants sont livrés en version réduite : économie, recherche, construction et production propres, commandant, une poignée d'unités, sans expérimentale ni marine. Les bots jouent toujours les Industriels.

## Socle commun

- **Race du joueur** (`Player::race`, `data::RACES`) : 0 Industriels, 1 Souche, 2 Transhumants. Paramètres d'init : une race par joueur après le brouillard (`params[6 + np × 4 + i]`) ; absente (anciennes parties), Industriels. Côté client : `simParams` (les bots jouent les Industriels) et `racesFromParams` (`packages/shared/src/protocol.ts`).
- **Salon** : chaque joueur humain choisit sa race (ordre `setRace` ; l'hôte peut aussi choisir celle des autres) ; une partie chargée garde ses races. La méta de sauvegarde garde la race de chaque joueur.
- **Données par race** : champ `race` sur `BuildingDef`, `UnitDef`, `TechDef` (`data_json` l'exporte). Un joueur ne pose, ne produit et ne recherche que ce qui est de sa race (`races::building_ok`, `unit_ok`, `tech_ok`, vérifiés dans `can_place` et `orders.rs`). Les démos et les tests en réseau partout (`World::infinite_grid`) posent tout pour le même joueur.
- **Commandant** : `UnitDef::commander` (robot de commandement, Reine, Arche) ; `races::commander_kind` choisit celui de départ. Victoire, explosion finale et élimination valent pour les trois.
- **Recherche** : 64 recherches (48 Industriels, 10 Souche, 6 Transhumants). Les acquises de 64 à 127 vont dans `Player::researched2` (`has_tech`, `set_tech`). `TechDef::also` : recherche des Industriels acquise en même temps (recettes partagées, par exemple l'électronique). `TechDef::excl` : choix exclusif (Souche).
- **Familles de dégâts** : `races::family_mult` ; les organismes vivants (`UnitDef::bio`) subissent 50 % de plus du feu (`Proj::Fire`).
- **Objets ajoutés** : sève (27), sels (28), ADN (29), relevés (30). Les tableaux d'objets des sauvegardes d'avant (format 2 et moins, 27 objets) se lisent avec des zéros pour les nouveaux (`ser.rs`).
- **Sauvegardes** : format 3 (race, recherches 64 à 127, réserves des réseaux, chenillards repliés, usure des gisements).
- **Rendu** : le bloc joueur ajoute race, recherches 64 à 127 et réserves de la Souche (`PLAYER_WORDS` = 13 + 4 × objets + 9). Fiche d'un bâtiment : `souche` (réseau, réserve, production) ou `transh` (chenillard, usure) ; fiche d'une unité : `pack`, `packLeft`.
- **Interface** : menu de construction par race (`buildCats`), panneau d'usine filtré par race, panneau de recherche avec l'arbre de la race et son coût (lots, ADN, relevés), barre du haut par race, bouton « Replier » des modules, message `EV_DEPLOY_FAILED` (45). Souche : la vue électrique (K) devient la vue des racines (une couleur par réseau, sa réserve ; un réseau sans sève est hachuré, `power_zones` marque ces réseaux d'un 1 en neuvième valeur), et le terreau s'affiche pendant la pose de tout organe.
- **Bots** : ils jouent les Industriels ; leurs estimations traitent les commandants des trois races comme des commandants (`UnitDef::commander`).
- **Essai en jeu** : `tools/e2e-races.mjs` (une race par partie, contre une IA).

## Souche

Code : `sim/src/souche.rs`. Tests : `sim/src/races_tests.rs`. Modèles : `assets/models/souche.ts`.

- **Départ** : la Reine, une graine-mère poussée (réserve de 400 sève et 150 sels dans son réseau) et un semeur. Pas de réserve commune ni de générateur.
- **Réseau de racines** : racines (1 × 1, zone de 3 cases) et graines-mères (3 × 3, zone de 6) sont des poteaux du calcul des zones électriques (`rebuild_power`) ; deux poteaux de la Souche sont reliés quand leurs zones (le **terreau**) se touchent (`zones_touch`). Chaque réseau a sa réserve de sève et de sels (`Net::seve`, `Net::sels`), plafonnée à 300 + 600 par graine-mère + 1 000 par bulbe (`Net::store`). Quand le réseau change, chaque bâtiment de la Souche apporte à son nouveau réseau sa part de la réserve de l'ancien, au prorata des bâtiments ; le reste de la division va au premier (`old_pools`, `split_pools`). Les bâtiments de la Souche rejoignent le réseau de leur terreau même sans électricité.
- **Pose** : sur le terreau de son joueur seulement, sauf la graine-mère (trois au plus par joueur, vivantes ou en croissance), qui fonde un réseau ailleurs.
- **Croissance** : un semeur (ou la Reine) plante l'organe et repart ; l'organe pousse seul toutes les 10 ticks en tirant son coût de son réseau, une fois et demie plus lentement qu'un chantier de puissance 10 (au même rythme avec Fécondité) ; sans réserve, il attend (`grow`). La graine-mère pousse gratuitement en 2 min 15. On n'aide pas un organe à pousser ; on le soigne une fois poussé.
- **Production** (toutes les secondes, `tick_organ`) : graine-mère 1 sève ; frondaison 1 sève, moins un quart par frondaison du même joueur à moins de 4 cases (un quart au moins) ; racine-puits sur l'hydrocarbure 3 sève, sur le fer, le cuivre ou le silicium 1 sel, sur le cristal 2 sels, multipliés par la pureté. Grandes frondaisons : +50 %.
- **Régénération** : organes et racines regagnent 2 % de leurs PV par seconde (dans un réseau) ; les organismes 2 % par seconde sur le terreau (4 % avec Sève vive, et 1 % hors du terreau).
- **Couveuse** : usine terrestre de la Souche ; elle prend dans son réseau, d'un coup, ce qui manque pour l'unité en tête de file ; isolée, elle ne pond pas. Ce qui dépasse quand la file change retourne au réseau.
- **Recherche** (Matrice) : une unité de recherche coûte `palier` ADN ; sans ADN, la Matrice convertit 20 sève de son réseau en 1 ADN toutes les 2 s (`lab_start`). **Digestion** : une unité (au sol) ou un bâtiment qui meurt sur le terreau d'un joueur de la Souche donne 10 × (palier + 1) sève et 3 × (palier + 1) sels à ce réseau, et (palier + 1) ADN si c'était un ennemi ou une bête de la faune (`digest`). Les organismes et organes ne laissent pas d'épave.
- **Arbre** : Cracheurs (1), Carapaces (2), Lianes (2), Membranes (3) ; mutations exclusives deux à deux : Écailles (+30 % de PV des organismes) ou Sève vive (palier 2) ; Acide (+25 % de dégâts) ou Fécondité (palier 3) ; Racines profondes (bâtiments de la Souche −40 % de dégâts subis) ou Grandes frondaisons (palier 4).
- **Bâtiments** : graine-mère, racine, frondaison, racine-puits, bulbe, couveuse, matrice, épine (défense sol et air), floraison (radar).
- **Unités** : Reine (commandement, crachat sol et air, plante), semeur, rongeur (corps-à-corps rapide), cracheur (artillerie acide en zone), carapace (char vivant), liane (immobilise 2,5 s une unité au sol), planeur à membranes (volant, spores en zone).

## Transhumants

Code : `sim/src/transhumants.rs`. Tests : `sim/src/races_tests.rs`. Modèles : `assets/models/transhumants.ts`.

- **Départ** : l'Arche et sept chenillards repliés autour d'elle (générateur avec 20 hydrocarbures, deux foreuses, fonderie, soute, assembleur, atelier), le stock de départ des Industriels et 20 relevés.
- **Chenillards** : unités qui portent un module (`UnitDef::deploys`). Ordre « Déployer » (`O_DEPLOY`) : immobile 15 s, il devient le bâtiment du module, posé à la place libre la plus proche (3 cases au plus ; une foreuse doit couvrir un gisement) ; un ordre de déplacement l'annule ; sans place, il reste chenillard (`EV_DEPLOY_FAILED`). Ordre « Replier » (`O_PACK` = 48, références de bâtiments) : le module redevient un chenillard immobile 10 s ; son contenu retourne à la réserve (remboursement), sa recette et le combustible du générateur restent à bord ; les PV suivent dans les deux sens. Fin du déploiement ou du repli : `UnitCold::ready_tick`.
- **Modules** : foreuse nomade, fonderie, assembleur, raffinerie, générateur (zone de 9 cases), soute, laboratoire, atelier (usine), bastion (tourelle lourde). Ils ne se construisent pas et ne s'améliorent pas. Pas de tapis ni de bras : les modules collés se passent les objets par transfert direct et partagent comme machines jumelles ; la **soute** (un dépôt) reçoit les produits, agrandit la réserve et alimente depuis la réserve les fabricants collés (un objet par seconde et par fabricant), comme un dépôt alimente une usine ou un générateur.
- **Raclage** : la foreuse nomade extrait deux fois plus vite qu'un extracteur, moins l'usure de son gisement (`World::wear`, ‰ par gisement) : +2 ‰ toutes les 5 s tant qu'une foreuse nomade y travaille, jusqu'à 600 ‰ ; −2 ‰ sinon. L'usure ne touche que les foreuses nomades.
- **Recherche par relevés** : une unité de recherche coûte 3 relevés par palier ; un laboratoire nomade sans relevés en tire un toutes les 2 s. Relevés gagnés : une case de vision (4 × 4 cases de carte) découverte par l'équipe en donne un à chacun de ses Transhumants (`update_visibility`) ; un ennemi détruit, 4 par palier (`credit_kill`).
- **Arbre** : Atelier lourd (canon tracté, bélier), Raffinage nomade, Électronique nomade (donne aussi l'électronique des Industriels : plaquettes, moteurs, processeurs), Bastion, Blindage (+50 % de PV des chenillards et de l'Arche), Cristal nomade (donne aussi le raffinage du cristal).
- **Unités** : Arche (commandement, canon et défense antiaérienne, répare), chenillards (neuf modules), pisteur (éclaireur rapide à grande vue), cavalier (char rapide), herse (antiaérien), canon tracté (artillerie, se met en batterie à l'arrêt), bélier (éperonne, bonus contre les bâtiments).
- **Animations** :
  - Chenilles : les crampons du brin supérieur (pivot `chenille_p<pas>`) glissent vers l'avant d'après la distance réellement parcourue à l'écran, modulo le pas des crampons (`render/entities.ts`). Les garde-chenilles sont étroits pour laisser voir le brin supérieur.
  - Déploiement et repli : le mot d'unité du tampon de rendu porte le bit 29 (déploiement) ou 30 (repli). Les stabilisateurs du chenillard (pivot `stabilisateurs`) sortent de la caisse pendant les 40 premiers % du déploiement et y rentrent pendant les 40 premiers % du repli ; la fiche montre la barre et les secondes restantes.

## À faire

- Bots pour la Souche et les Transhumants.
- Icônes de la barre de construction et des usines pour les nouvelles clés (générées par `tools/sprites`, qui passe par un service d'images externe).
- Rendu du terreau au sol, et vue du réseau de racines (comme la vue électrique).
- Domestication des nids par la Reine, arrimage explicite entre chenillards, production en roulant : prévus dans les propositions, pas réalisés.
