# Règles du jeu : cartes, victoire, brouillard

> Partie de la spécification. Index et liste des fichiers : [docs/SPEC.md](../SPEC.md).

Une partie se joue sur une carte de 10 ou 20 km et se termine quand il ne reste qu'une équipe avec un robot de commandement. La faune (nids de bêtes hostiles, voir Faune) ne compte pas.

## Cartes

- Deux tailles, reprises des cartes moyennes et grandes de Supreme Commander : 10 km (512 × 512 cases) et 20 km (1 024 × 1 024 cases) ([wiki FAF](https://wiki.faforever.com/en/Development/Mapping/GPG-Map-Editor)).
- Une case correspond à une unité de carte de Supreme Commander. Les bâtiments et les tapis se posent sur cette grille, comme dans Factorio.
- Chaque position de départ a des gisements de fer, de cuivre, de silicium et d'hydrocarbure à proximité. Un anneau de six gisements de plus attend juste au-delà de la zone du générateur principal, à portée de sa zone améliorée (voir Économie). Les gisements de cristal sont rares et placés dans des zones disputées.
- Les cartes sont produites par un générateur à graine (relief, eau, gisements, positions de départ), avec ou sans eau.
- Pureté des gisements (`Spot::purity`, `map::spot_purity`) : impur (rendement 50 %), normal (100 %) ou pur (200 %). Les gisements de départ et le cristal sont normaux. Les autres sont tirés d'après la position (`hash3`, sans toucher au générateur aléatoire de la carte), selon la distance au départ le plus proche : à moins de 18 % de la largeur de la carte, 50 % d'impurs, 45 % de normaux et 5 % de purs ; au-delà de 25 %, en zone disputée, 10 % d'impurs, 60 % de normaux et 30 % de purs ; entre les deux, 25 % d'impurs, 60 % de normaux et 15 % de purs. La pureté est relevée à la pose (`Building::purity`) et multiplie le débit de l'extracteur, la récolte du commandant et la production d'une centrale géothermique. Fiche du gisement et de l'extracteur : pureté et rendement ; `map_info` ajoute la pureté de chaque gisement après la liste des gisements.
- Geysers : « gisements » de vapeur (`GEYSER`, 250, pas un objet), en zone disputée (près des points de cristal, plus un par 65 536 cases, à plus de 18 % de la largeur de la carte de tout départ), avec une pureté. Seule la centrale géothermique s'y pose ; ni extracteur ni autre bâtiment.

## Victoire

- Chaque joueur commence avec son seul robot de commandement.
- Quand le robot de commandement est détruit, il explose et endommage tout autour de lui. Le joueur est éliminé, et toutes ses unités et tous ses bâtiments sont détruits.
- Les équipes sont fixées dans le lobby. La dernière équipe qui a encore au moins un robot de commandement gagne.
- En partie solo (un seul joueur humain, contre des IA), la vitesse de jeu se règle de ×0,5 à ×4 (pavé ×/÷, ou boutons à côté de l'horloge) : le serveur cadence les ticks plus ou moins vite, la simulation est inchangée.
- Pause : c'est la vitesse 0 (message `speed`, `Game.setSpeed`). Le serveur cesse de produire des ticks ; comme chaque client n'avance qu'aux ticks reçus, tous s'arrêtent sur le même, et la simulation n'est pas touchée (rien n'est ajouté aux sauvegardes ni aux replays). En solo, le joueur met en pause et reprend ; à plusieurs, seul l'hôte le fait (il ne change pas la vitesse, qui reste ×1), et tous voient « Partie en pause · par X ». La reprise repart à la vitesse d'avant la pause, l'horloge du serveur recalée sur le tick en cours. Pendant la pause, la caméra, la sélection, les panneaux et les ordres restent possibles ; les ordres partent au premier tick après la reprise. L'affichage reste sur le dernier tick (pas d'interpolation), unités, tourelles et effets figés. Touches : Pause ou F10, bouton à côté de l'horloge. Test : `packages/server/test/pause.test.ts` (aucun tick pendant la pause, ticks consécutifs, hash identiques chez un client qui rejoue les ticks reçus).
- Quitter vers le salon (menu Échap, voir [rendu.md](rendu.md)) : l'hôte arrête la partie pour tous (message `quit`). Le serveur fait d'abord une sauvegarde automatique, puis remet le salon à zéro ; la partie se reprend en chargeant cette sauvegarde.

## Brouillard de guerre

Chaque équipe voit autour de ses unités et de ses bâtiments ; le reste de la carte est inexploré ou assombri, et les bâtiments ennemis déjà aperçus y restent en fantômes. L'hôte peut désactiver le brouillard dans le salon (activé par défaut).

- Sans brouillard, tous les joueurs voient toute la carte en permanence : terrain, unités et bâtiments ennemis, sans zone inexplorée ni fantôme. Tout est ciblable sans repérage, même les unités furtives (commando camouflé, bombardier furtif, unités brouillées) et les sous-marins.
- C'est le dernier paramètre d'init de la simulation, après la faune : 1 activé, 0 désactivé, absent activé (les sauvegardes d'avant ce réglage gardent leur brouillard). La simulation le relit dans ses paramètres, donc il suit les sauvegardes et les replays ; la méta de sauvegarde le garde aussi (`fog`) pour le salon.
- Côté simulation (`World::fog`), chaque équipe est alors omnisciente comme la faune, et sa grille de vision est pleine (vue, radar, détection, explorée). Côté client, le rendu du brouillard et le voile de la minimap sont coupés comme pour un spectateur.
