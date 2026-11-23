# Bots

> Partie de la spécification. Index et liste des fichiers : [docs/SPEC.md](../SPEC.md).

Les bots tournent sur le serveur, en TypeScript, et envoient leurs ordres au relais comme des joueurs humains. Ils reprennent le fonctionnement de l'IA d'escarmouche de Supreme Commander: Forged Alliance.

- Le bot lit l'état de la partie dans la copie de référence du serveur. Ses ordres suivent le même chemin que ceux d'un humain : délai de 3 ticks, enregistrement dans le replay.
- Le code des bots n'est pas soumis aux règles de déterminisme, puisqu'il ne tourne qu'à un seul endroit. Seuls ses ordres entrent dans la simulation.
- Les bots ne consomment rien sur les PC des joueurs. Leur coût de calcul est sur le VPS.
- Un bot prend ses décisions tous les 10 ticks (une demi-seconde), pas à chaque tick.

Organisation reprise de Supreme Commander ([exemple de builder dans le code de FAF](https://github.com/FAForever/fa/pull/5508)) :

- Le bot dispose d'une liste de builders. Chaque builder décrit une tâche (construire tel bâtiment, produire tel type d'unité), avec une priorité et des conditions (ressources disponibles, nombre d'unités déjà présentes, menace détectée).
- Des gestionnaires (ingénieurs, usines, pelotons) choisissent à chaque décision le builder valide de plus haute priorité.
- Les unités produites sont regroupées en pelotons, chacun avec une mission : attaque, défense, expansion, harcèlement.
- Des personnalités changent les listes de builders et leurs priorités : Adaptive, Rush, Turtle, Tech.
- Une variante AIx triche avec un multiplicateur de ressources et de vitesse de construction réglable dans le lobby, comme dans Forged Alliance ([wiki FAF](https://wiki.faforever.com/Development/AI/Custom-AIs)).
- Dépôts et drones (voir [economie.md](economie.md)) : les bots ne gèrent pas eux-mêmes le ravitaillement (sauf les relais logistiques de leur arsenal, voir plus bas). Ils lisent dans `stock` le total de leurs dépôts et des soutes de leurs constructeurs ; la simulation fait charger d'abord leur soute aux ingénieurs dont le chantier est loin des dépôts, et le drone de chaque générateur va chercher l'hydrocarbure de leurs mines de combustible (à moins de 30 cases ; le gisement d'hydrocarbure le plus proche d'un départ est à 9 à 19 cases).
- Tapis d'amenée et dépôts : un tapis d'amenée ne démarre jamais contre un dépôt de module ou d'arsenal, sauf s'il y entre par son avant (`Planner.startLeaks`, appelé par `planMine` et `planExtractor`). Un début de file qui part d'une face d'un dépôt, ou qui la longe, en devient la sortie (voir Tapis de sortie dans [logistique.md](logistique.md)) : le dépôt y pose son stock à la cadence du tapis, ce stock tourne en boucle sur le tapis principal et manque aux chantiers. Test : `packages/server/test/layout.test.ts`. Une base tracée avant le 23 novembre 2026 (sauvegarde) peut avoir une telle amenée : son dépôt laisse alors en circulation de quoi remplir ces tapis.

## Organisation du code

Dossier `packages/server/src/bots/`. `ai.ts` ne garde que la classe `SkirmishAI` : l'état du bot, ses requêtes de base (`has`, `stock`, `baseCenter`, `enemySum`, `reachable`, `placementState`…) et la boucle de décision `think`, qui appelle les gestionnaires dans un ordre fixe. Le reste est réparti par thème, en fonctions qui reçoivent le bot en premier paramètre (`pickTarget(ai, …)`), comme `navy.ts`, `arsenal.ts` et `landing.ts` :

| Module | Thème |
| --- | --- |
| `strategy.ts` | Adversaire visé (`pickTarget`), rapports de force (`analyse`), objectifs d'attaque (`objective`), appels à l'aide entre alliés |
| `land.ts` | Terres joignables à pied (`landComponents`, `landNear`) |
| `engineers.ts` | Gestionnaire des ingénieurs : chantiers (`Project`), bâtisseurs, coûts et réserves, recyclage des épaves |
| `builders.ts` | Liste des builders d'ingénieurs et leurs priorités (`engBuilders`), fabrication des chantiers (emplacements des modules, extracteurs, tourelles, dépôts, modules) |
| `fuel.ts` | Combustible des générateurs : dépôts collés, mines de combustible |
| `economy.ts` | Régulation des recettes par la demande (`economy`), dépôts pleins (`unjam`), amélioration du générateur principal |
| `factories.ts` | Gestionnaire des usines : production, composition de l'armée |
| `research.ts` | Gestionnaire de la recherche |
| `commander.ts` | Mise à l'abri du commandant |

Autres modules : `army.ts` (pelotons), `intel.ts` (cartes de menace), `layout.ts` (tracé des modules et de l'arsenal), `personas.ts` (personnalités), et ceux de la marine, des transports et de l'arsenal (plus bas).

- Un module de thème importe `SkirmishAI` avec `import type` : aucun import de `ai.ts` à l'exécution. `ai.ts` réexporte `landComponents` et `EngBuilder`.
- Le serveur n'a pas de tsconfig : un appel à une méthode ou à une fonction qui n'existe plus ne casse qu'à l'exécution. Après un déplacement de code, passer `tsc --noEmit` sur `packages/server/src` avec un tsconfig temporaire (`strict`, `allowImportingTsExtensions`, `moduleResolution: bundler`, `skipLibCheck`).

## Marine

Code : `packages/server/src/bots/water.ts` (analyse de l'eau), `navy.ts` (usine navale, flotte), `arsenal.ts` (composants). Les bots ne jouent que les Industriels.

- Eau utile (`usefulSea`) : un plan d'eau navigable d'au moins 1 500 cases, à moins de 75 cases du départ du bot, et qui passe à moins de 75 cases du départ d'un adversaire (le meilleur : celui qui en approche le plus à moins de 55 cases, puis le plus proche). À défaut, un plan d'eau contesté : un navire ou une usine navale ennemis devant notre côte. Sans eau utile, rien ne change pour la marine. L'analyse est faite une fois par carte et partagée par les bots.
- Décision (`navyGoal`, toutes les 10 s) : à partir de 5 min si le goût de la personnalité pour la marine (`Persona.naval`) est d'au moins 0,5 (Adaptive 0,7, Turtle 0,6, Tech 0,8, Rush 0,2) ou si aucun adversaire n'est joignable par la terre ; à partir de 4 min, quelle que soit la personnalité, si une flotte ennemie est dans ce plan d'eau. Niveau facile : seulement après 20 min, sur une île ou contre une flotte, quatre navires au plus.
- Recherches : électronique puis marine avant celles de la personnalité (antiaérien d'abord si l'aviation ennemie domine ou sur une île), ensuite chimie, destroyer, croiseur, marine lourde.
- Usine navale : 3 × 3 cases d'eau du plan d'eau, près de l'arsenal, une terre à quelques cases pour le relais électrique, sortie vers le large ; relais logistiques jusqu'au dépôt de l'arsenal s'il est à plus de 29 cases. Une deuxième quand la flotte et la réserve le permettent.
- Flotte : seulement ce que les dépôts peuvent payer, selon des poids (frégate 3, destroyer 4, croiseur 2, cuirassé 2, sous-marin 0,8, porte-avions 0,5) corrigés par la menace : sous-marins +2,5 et destroyers +2 contre une marine, frégates, croiseurs et porte-avions contre l'aviation. Plafond : 12 navires, plus un par tranche de 5 min, plus 10 contre une flotte.
- Missions : la flotte de réserve patrouille devant l'usine et les modules côtiers, engage les navires ennemis à portée de nos côtes si elle tient le combat (sinon elle reste au poste), et attaque quand elle a quatre navires (un de plus à chaque attaque) et 1,2 fois la défense de l'objectif, ou le double de navires. Objectif : bâtiments ou commandant à portée de l'eau (valeur / défense / distance, comme les assauts terrestres), ou marine adverse plus faible ; elle se place sur la case d'eau la plus proche. Elle rentre si l'ennemi local la dépasse de 60 %, s'il reste moins de 30 % des navires, si elle est bloquée, si l'objectif reste hors d'atteinte au bout de 2 min au poste (il est alors moins tentant pendant 5 min) ou s'il n'y en a plus ; une grosse menace sur nos côtes la rappelle. Les navires sont hors des pelotons terrestres et de la puissance terrestre du renseignement (`Intel.navy`).

## Transports et débarquements

Code : `packages/server/src/bots/landing.ts`.

- Décision (`landingGoal`) : sur une île (aucun adversaire joignable par la terre), dès 5 min, c'est le mode d'attaque terrestre normal ; dès 8 min si un adversaire au moins est sur une autre terre ; après 14 min si l'adversaire visé a repoussé quatre assauts terrestres. Niveau facile : seulement sur une île, après 15 min, deux transports.
- Production : usine aérienne à portée du dépôt de l'arsenal (une est construite s'il n'y en a pas) ; `Persona.transports` appareils (Adaptive et Tech 3, Rush et Turtle 2), un de plus sur une île et au niveau difficile ; transports lourds quand la recherche et les composites sont là ; puis quelques chasseurs d'escorte.
- Déroulement : `load` (chaque transport va chercher ses passagers, pris dans le peloton terrestre en formation et retirés des pelotons ; départ quand tous sont à bord, ou au bout de 70 s avec ceux qui y sont), `fly` (vers la case la plus sûre à 9 à 17 cases de l'objectif : valeur / défense au sol / antiaérien ; refusé si l'antiaérien sur place et en route dépasse 300 par transport ; réévalué en vol), débarquement, puis les transports rentrent et les troupes attaquent (groupe : objectif, puis le suivant sur la même terre, le commandant à moins de 20 cases en direct). `return` : base envahie, trop de pertes, plus d'objectif ou vol de plus de 3 min.
- Pertes : un transport abattu emporte ses passagers, les autres continuent ; les soldats restés au sol reviennent à l'armée. Un transport arrêté avec des passagers reçoit de nouveau son ordre ; hors opération, il les dépose à la base. Un groupe débarqué sans objectif sur sa terre attend un transport libre, qui l'emmène ailleurs ou à la base. Un objectif où un groupe a été anéanti est moins tentant pendant 6 min.
- Les chasseurs escortent le transport de tête. Sur une île, l'armée terrestre garde 24 unités plus 10 par transport, et trois tourelles antiaériennes d'avance.

## Arsenal

Les modules « sushi » fournissent mal les paliers 2 à 4 : leur tapis principal finit dans un dépôt plafonné par objet et se bouche quand une plaque atteint le plafond. Un bot qui veut une marine ou des transports, et lui seul, construit un arsenal (`arsenal.ts`, tracé `Planner.planArsenal`).

- Un dépôt, une boucle de tapis qui en part (trois bras) et y revient, et des ateliers le long de la boucle. Les filtres du dépôt choisissent ce qui circule : à chaque décision, les deux objets les plus demandés par les ateliers. Ce dont personne n'a besoin revient au dépôt ; chaque atelier s'arrête (pause) quand son produit est en réserve, chaque source quand le dépôt en a assez, donc la boucle ne se bouche pas. Ateliers : engrenages, câbles collés aux circuits, pièces de bras, lots 1 à 4, munitions, moteurs, carburant, plaquettes, processeurs, composites, laboratoires ; fonderies d'acier sur le tapis d'amenée. La longueur (3 à 7 colonnes) suit la place.
- Pièges de la simulation évités : un objet ne doit pas arriver à un atelier à la fois d'un voisin collé et de la boucle (bras bloqué, main pleine) ; aucun atelier n'est servi par le dépôt lui-même ; un tapis qui passe devant un extracteur en reçoit le minerai brut ; un générateur sans combustible ne relie plus ses voisins (les ouvrages de l'arsenal ne comptent que les relais et le générateur principal : `Planner.robust`, `bridge`).
  - Deux défauts des dépôts, que ce tracé contournait, sont corrigés dans la simulation depuis le 23 novembre 2026 (voir Sorties d'un dépôt dans [economie.md](economie.md)) : le bras d'un dépôt qui n'avait rien à prendre gardait son tour et bloquait les autres bras de ce dépôt (d'où l'absence d'atelier servi par le dépôt), et un dépôt ne posait qu'environ 0,9 objet par seconde sur un tapis simple (6,7 aujourd'hui ; un bras : 1,4). Le tracé de l'arsenal n'a pas été revu depuis.
- Fer et cuivre : liaison depuis le dépôt principal (bras et tapis, tracée en même temps que l'arsenal), filtrée selon ce qui manque, et mines propres. Les mines du module principal sont mises en pause quand son dépôt est presque plein d'une plaque (`unjam`, dans `economy.ts`), et ce dépôt est agrandi.
- Relais logistiques : ils relient l'arsenal au dépôt principal, aux dépôts pleins d'hydrocarbure quand des générateurs sont à sec, à la raffinerie posée sur une mine de combustible (à défaut d'hydrocarbure à l'arsenal) et aux usines navales lointaines. L'acier en trop améliore les mines de fer proches.

## Sauvegarde et contrôle

- L'état de la marine, des débarquements et de l'arsenal (`navy`, `landing`, `arsenal` de `SkirmishAI`) est fait de données simples, sauvegardées avec le reste ; absent d'une sauvegarde plus ancienne, il prend ses valeurs de départ et le bot décide à partir de la partie en cours (la version d'état reste 1).
- Tests : `packages/server/test/navy.test.ts`. Partie entière : `node tools/bench/naval-check.ts --check` (graine 1, quatre îles : usine navale, navire et débarquement constatés), et les mêmes options que les autres bancs pour une autre carte.
