---
name: ajouter-contenu
description: Ajouter une unité, un bâtiment, une recherche ou un objet au jeu. Donne la liste complète des endroits à toucher (tables de la simulation, doubles en TypeScript, modèle 3D, description, icône, menu de construction, bots, tests à compteurs, spécification). À utiliser dès qu'une tâche crée une entrée dans UNITS, BUILDINGS, TECHS ou ITEMS.
---

# Ajouter une unité, un bâtiment, une recherche ou un objet

Les tables sont dans `sim/src/data.rs`. Le client et les bots les reçoivent par `data_json` : beaucoup de choses se font seules, mais pas tout, et plusieurs oublis ne font échouer aucun test (liste à la fin).

## Règle commune : ajouter à la fin, ne jamais retirer

- L'indice d'une entrée est écrit dans les sauvegardes et les replays, et cité en numéro un peu partout : `weapons: &[45]`, `tech: 12`, prérequis et `excl` des recherches, quelques indices en dur (`stress.rs`, `tools/scenario.mjs`, le client). Insérer au milieu ou retirer une entrée décale tout le reste.
- La taille du tableau est écrite à la main (`UNITS: [UnitDef; N]`, `BUILDINGS`, `TECHS`) : la changer.
- Une constante `U_…`, `B_…` ou `T_…` n'est nécessaire que si du code cite l'entrée.
- Limites : 256 types d'unités et 256 de bâtiments (8 bits dans le tampon de rendu), arme d'un bâtiment sur un `i8`, 128 recherches (deux masques de 64 bits), 6 paliers de recherche pour les Industriels (les laboratoires ne gèrent que 6 lots).

## Unité

1. **Données** : `UnitDef { key, name, …, ..UD }` à la fin de `UNITS`. Par défaut : usine terrestre, Industriels, palier 1. `tech` est le numéro de la recherche, `weapons` des indices dans `WEAPONS`. Souche : `bio: true`, et `litter` de 3 à 6 pour un organisme de couveuse.
2. **Automatique** : le panneau d'usine (`factoryUnitKinds`, par usine et par race), les contrôles de race, la puissance estimée par les bots.
3. **Modèle** : une description de pièces sous la clé de l'unité, dans la table de sa race (`UNIT_MODELS` dans `assets/models/units.ts`, ou les tables de `souche*.ts` et `transhumants.ts` qu'elle reprend). Sans modèle, le jeu dessine une boîte de repli sans erreur. Vérifier avec `npm run viewer:capture units <clé>` ; la capture réécrit `tools/viewer/data.json`, qui est versionné.
4. **Description** : `packages/client/src/game/unitDescs.ts`. Un test échoue si elle manque. Courte : une ou deux phrases, sans exemple (règle dans docs/spec/rendu.md).
5. **Icône** : skill `generer-images`. Sans icône, l'interface affiche une abréviation du nom.
6. **Bots** (ils ne jouent que les Industriels) : une unité n'est jamais produite tant que sa clé n'est pas dans les poids d'armée (`persona.army` dans `packages/server/src/bots/personas.ts`, corrigés par `armyWeights`), ou dans les listes de la marine (`navy.ts`) et de l'aviation (`landing.ts`).
7. **Spécification** : tableaux de `docs/spec/contenu.md` pour les Industriels, `docs/spec/races.md` pour la Souche et les Transhumants.

## Bâtiment

1. **Données** : `BuildingDef { key, name, …, ..BD }` à la fin de `BUILDINGS`. La classe par défaut est `Wall`.
2. **Comportement** : une classe existante (`BClass`) suffit souvent. Une classe nouvelle demande : la variante dans l'enum Rust et son double numérique `BClass` dans `packages/shared/src/data.ts` ; l'ajouter à `needs_tick` ; une branche dans le `match` de `update_buildings` ; et `accepts` et `insert_item` s'il reçoit des objets. Ces fonctions sont dans le module `buildings` de la simulation. `packages/server/src/bots/intel.ts` cite quelques classes par leur numéro.
3. **Menu de construction** : sa clé dans `BUILD_CATS` ou `SOUCHE_CATS` (`packages/client/src/game/catalog.ts`). Sinon le bâtiment existe mais n'est jamais proposé. Au clavier, un onglet offre dix places (chiffres 1 à 9, puis 0).
4. **Description** : `packages/client/src/game/buildingDescs.ts`. Un test échoue si elle manque. Courte : une ou deux phrases, sans exemple (règle dans docs/spec/rendu.md).
5. **Modèle** : `BUILDING_MODELS` (`assets/models/buildings.ts`) ou la table de sa race. Les variantes se rattachent par suffixe de clé (`_seg`, `_virage_g`…).
6. **Icône** : skill `generer-images`. Sans icône, le menu montre le pictogramme de la catégorie.
7. **Bots** : un bâtiment n'est jamais construit sans code (plans de `layout.ts`, tourelles dans le code de l'IA).
8. **Spécification** : comme pour une unité.

## Recherche

1. **Données** : `t!(…)` à la fin de `TECHS`. Les prérequis sont des numéros. `excl` (choix exclusif) doit être réciproque. `also` donne en même temps une recherche des Industriels.
2. **Client** : rien. L'arbre est rangé tout seul, une colonne par palier (`Research.svelte`).
3. **Bots** : sa clé dans les listes de recherche de la personnalité (`persona.research`, `urgent`). Ses prérequis doivent y figurer aussi : le bot saute une recherche dont les prérequis manquent.
4. **Spécification** : `docs/spec/races.md` pour la Souche et les Transhumants ; `contenu.md` ne liste que les paliers des Industriels.

## Objet

C'est l'ajout le plus coûteux.

1. **Données** : `ITEMS` et `NUM_ITEMS`.
2. **Sauvegardes** : les tableaux par objet (`purse`, `produced`, `consumed`…) sont écrits avec `NUM_ITEMS` cases. Un objet de plus décale la lecture des sauvegardes existantes : monter `save::VERSION` et ajouter un rattrapage comme celui de `NUM_ITEMS_V2` (`ser.rs`). Aucun test ne couvre ce cas : en écrire un qui charge une sauvegarde de la version précédente.
3. **Doubles en TypeScript** : `NUM_ITEMS` dans `packages/shared/src/render.ts` (le bloc joueur du tampon de rendu en dépend), et la constante de l'objet dans `packages/shared/src/data.ts` si le client la cite.
4. **Description** : `packages/client/src/game/itemDescs.ts` (testée). **Modèle** : `ITEM_MODELS` dans `assets/models/items.ts` (repli si absent). **Icône** : skill `generer-images` (repli : une pastille de couleur).

## Tests à mettre à jour ou qui signalent un oubli

Les tests Vitest lisent `sim.wasm` : `npm run build:sim` d'abord.

- `packages/shared/test/sim.test.ts` : nombres d'unités, de bâtiments et de recherches, au total et par race, et listes exactes des unités à portée, des œufs et des tourelles. À mettre à jour à chaque ajout.
- `packages/client/test/unitDescs.test.ts`, `buildingDescs.test.ts`, `itemDescs.test.ts` : une description par clé, aucune en trop.
- Rust, `recipes_follow_the_tech_tree` : le coût d'une unité ou d'un bâtiment doit être fabricable avec les recettes que sa recherche implique.
- Rust, `showcase_demo_places_every_land_building_and_unit` : la vitrine pose chaque bâtiment terrestre et chaque unité.
- Souche : `litter_sizes_are_three_to_six`, arbre entièrement atteignable, `excl` réciproques. Transhumants : `the_table_of_upgrades_is_sound` (une nouvelle unité de combat doit être ajoutée à sa liste pour être couverte).

## Ce qu'aucun test ne vérifie

À contrôler à la main : le modèle existe, l'icône existe, le bâtiment est dans le menu, la clé est unique, `BClass` et `NUM_ITEMS` sont les mêmes en Rust et en TypeScript.

## Contrôles de fin

`npm run test:rust`, `npm run test:js`, `npm run test:determinism`, une capture du modèle, et `npm run test:ai` si un coût ou une recette des Industriels a changé.
