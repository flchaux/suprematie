# Spécification technique du STR multijoueur

Nov 16, 2026 · @Florian

La spécification est découpée par thème dans `docs/spec/`. Lire cet index, puis seulement les fichiers utiles à la tâche.

## Objet et périmètre

Le projet est un jeu de stratégie en temps réel multijoueur, jouable dans le navigateur, qui mélange la construction d'usines de Factorio et les batailles à grande échelle de Supreme Commander.

- Les joueurs extraient des ressources, construisent des chaînes de production reliées par des tapis roulants et produisent des armées qui s'affrontent sur la même carte.
- Une partie réunit jusqu'à 8 joueurs, humains ou bots. Les bots reprennent le fonctionnement de l'IA d'escarmouche de Supreme Commander.
- Le jeu a trois races jouables : les Industriels, la Souche et les Transhumants (voir [races.md](spec/races.md)).
- Le jeu se lance depuis un lien, sans installation et sans compte. Il est prévu pour Chrome uniquement. Il reste privé, hébergé sur le VPS, et le serveur n'héberge qu'une partie à la fois.
- Il n'y a pas de mods ni de version Steam.
- Le style visuel est en 3D avec peu de polygones, en vue de dessus inclinable, avec un zoom continu de l'unité à la carte entière.
- Claude écrit tout le code avec Claude Code. Le porteur du projet relit, teste et décide.

La partie de référence, qui sert d'objectif de performance, réunit 8 joueurs, 8 000 unités et 40 000 bâtiments et tapis sur un PC fixe de milieu de gamme (voir Objectifs de performance, dans [architecture.md](spec/architecture.md)).

## Fichiers

| Fichier | Contenu | À lire pour |
| --- | --- | --- |
| [jeu.md](spec/jeu.md) | Cartes (relief, gisements, pureté, geysers), victoire, brouillard de guerre | Règles générales, génération de carte |
| [economie.md](spec/economie.md) | Ressources, transfert direct, machines jumelles, cadence et fragments, améliorations, usines, réserve, épaves, récolte du commandant | Production, bâtiments de fabrication, stock |
| [energie.md](spec/energie.md) | Zones électriques, générateurs et combustible, consommation des tapis, géothermie, EPPZ | Électricité, générateurs |
| [logistique.md](spec/logistique.md) | Forme et tracé des tapis, rails et trains, anneaux de transport, porte de transit | Tapis, rails, transport d'unités |
| [faune.md](spec/faune.md) | Nids, hordes, attaques, parades, réplicateurs | Faune, PNJ |
| [contenu.md](spec/contenu.md) | Arbre technologique, unités, déplacements en formation, bâtiments | Ajout ou équilibrage d'unités, de bâtiments, de recherches |
| [architecture.md](spec/architecture.md) | Pile technique, architecture, simulation déterministe, algorithmes de performance, réseau, objectifs de performance | Architecture, réseau, simulation, performance |
| [races.md](spec/races.md) | Races jouables : socle commun, Souche, Transhumants | Tout ce qui dépend de la race du joueur |
| [bots.md](spec/bots.md) | IA d'escarmouche | Bots |
| [rendu.md](spec/rendu.md) | Rendu, interface, sons, modèles 3D | Client, affichage, modèles |
| [processus.md](spec/processus.md) | Tests et règles pour Claude Code, format des sauvegardes, maîtrise du coût, étapes, questions ouvertes, sources | Tests, sauvegardes, organisation du travail |

Une règle nouvelle va dans le fichier de son thème ; un nouveau thème, dans un nouveau fichier ajouté à ce tableau.
