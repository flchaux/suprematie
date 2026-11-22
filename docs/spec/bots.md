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
