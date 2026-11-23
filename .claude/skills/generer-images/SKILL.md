---
name: generer-images
description: Générer ou refaire les icônes de l'interface (objets, bâtiments, unités) et les textures des modèles 3D ou du sol avec l'API d'images. À utiliser quand une clé n'a pas d'icône, quand une icône est à refaire, ou pour une nouvelle matière de modèle.
---

# Générer des icônes et des textures

Les images viennent de l'API d'images d'OpenAI : un service externe, payé à l'image. La clé est lue dans la variable `OPENAI_API_KEY` ; ne jamais l'afficher ni l'écrire dans un fichier. Les scripts ne redemandent pas une image déjà présente dans leur dossier `raw/`.

## Icônes (tools/sprites)

1. Décrire l'image dans `tools/sprites/manifest.mjs` : une entrée par clé (la clé de l'unité, du bâtiment ou de l'objet dans `sim/src/data.rs`), en anglais, qui décrit le sujet seul. Le style commun est ajouté par le script : `STYLE` et `ITEM_STYLE` pour les Industriels ; `SOUCHE_STYLE` et `SOUCHE_ITEM_STYLE` pour la Souche (tables `SOUCHE_ITEMS`, `SOUCHE_BUILDINGS`, `SOUCHE_UNITS`).
2. Générer : `node tools/sprites/generate.mjs <items|buildings|units|art|decor> [clé…] [--quality low|medium|high] [--force]`. Sans clé, toute la catégorie. `--force` refait une image qui existe déjà. Les images brutes (1 024 px) vont dans `tools/sprites/raw/`, non versionné.
3. Réduire : `python3 tools/sprites/process.py`, qui écrit les WebP dans `packages/client/src/assets/sprites/` (objets 96 px, bâtiments et unités 128 px).
4. Juger à la taille de l'interface : assembler une planche des icônes réduites à 44 px montre tout de suite celles qui ne se lisent pas. Refaire celles-là une par une (`--force`), deux tours au plus.

L'interface trouve une icône par sa clé (`packages/client/src/ui/sprites.ts`) : aucun code à toucher.

## Textures des modèles et du sol (tools/textures)

1. Décrire la matière dans `tools/textures/manifest.mjs` : table `MATERIALS` (`style: "organic"` pour une matière vivante), table `GROUND` pour le sol (clé `ground_<nom>`).
2. Générer : `node tools/textures/generate.mjs [clé…] [--quality low|medium|high] [--force]`, vers `tools/textures/raw/`.
3. Traiter : `python3 tools/textures/process.py`, qui rend chaque image raccordable et l'écrit en 512 × 512 WebP (rouge : détail, vert : relief, bleu : rugosité). Les réglages par matière sont dans `TUNING`, en tête du script.
4. Une matière nouvelle demande aussi du code : sa case dans l'atlas (`packages/client/src/render/textures.ts` : `MATERIAL_KEYS`, `LAYER_CELL`) et la couche que portent les pièces (`packages/client/src/models/generator.ts` : `MATERIAL_LAYER`, ou `SKIN_LAYER` pour une matière propre à une race). Voir « Modèles 3D » dans `docs/spec/rendu.md`.
5. Vérifier sur un modèle : `SUFFIX=avant npm run viewer:capture units <clé>` avant, puis `SUFFIX=apres` après.

## Règles

- Qualité `medium`, celle par défaut des scripts.
- Dire à l'utilisateur combien d'images ont été demandées au service.
- Les images brutes ne sont pas versionnées. Avant de supprimer un worktree, les copier dans `tools/sprites/raw/` et `tools/textures/raw/` du dossier principal, sinon la génération suivante les redemande toutes.
- Un seul passage dans le navigateur, à la fin, pour voir les icônes dans un menu (skill `essai-navigateur`).
