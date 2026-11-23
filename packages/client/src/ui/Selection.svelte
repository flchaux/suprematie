<script lang="ts">
  import { ui, hasTechUI } from "../game/state.svelte.ts";
  import { UNIT_TRAITS, ADAPT_FAMILIES } from "../game/traits.ts";
  import SplitIcon from "./SplitIcon.svelte";
  import { UNIT_DESCS } from "../game/unitDescs.ts";
  import { BUILDING_DESCS } from "../game/buildingDescs.ts";
  import { client } from "../game/client.ts";
  import { BClass, RECIPE_NONE, ADN, SEVE, PACK1, HYDROCARBON, ENERGY_CELL, pausableClass } from "@supreme/shared";
  import Item from "./Item.svelte";
  import Cost from "./Cost.svelte";
  import Upgrades from "./Upgrades.svelte";
  import { canPay } from "../game/reach.ts";
  import Icon from "./Icon.svelte";
  import { sprite } from "./sprites.ts";
  import { PLAYER_COLORS } from "../models/generator.ts";
  import { NATURE_COLOR } from "@supreme/shared";
  import { factoryUnitKinds } from "../game/catalog.ts";
  import { keyOf } from "../game/keys.svelte.ts";
  /** geyser : « gisement » de vapeur, pour la centrale géothermique (voir sim/src/data.rs) */
  const GEYSER = 250;

  const d = $derived(ui.data);
  const sb = $derived(ui.selBuilding);
  const bdef = $derived(sb && d ? d.buildings[sb.kind] : null);
  const info = $derived(ui.buildingInfo as Record<string, any> | null);
  const mine = $derived(!!sb && sb.owner === ui.me);
  const kinds = $derived(ui.selUnits.map((g) => g.kind));
  const has = (key: string) => !!d && kinds.some((k) => d.units[k].key === key);
  const anyFerry = $derived(!!d && kinds.some((k) => d.units[k].carry > 0 && d.units[k].layer === 4));
  const anyCarrier = $derived(!!d && kinds.some((k) => d.units[k].carry > 0));
  const anyEng = $derived(!!d && kinds.some((k) => d.units[k].buildPower > 0));
  // déploiement : sonde, artillerie lourde, canon tracté, chenillards des Transhumants (ils deviennent leur module)
  const chenillards = $derived(!!d && kinds.some((k) => (d.units[k].deploys ?? -1) >= 0));
  // Reine de la Souche : « Enraciner » (sur son terreau) ou « Déraciner »
  const queen = $derived(has("queen"));
  const rooted = $derived(queen && !!ui.unitInfo?.deployed);
  const deployable = $derived(queen || has("sonde") || has("heavy_artillery") || has("towed_gun") || chenillards);
  // même ordre que la rangée de touches de l'usine (factory1, factory2…)
  const factoryUnits = $derived(bdef && d && bdef.cls === BClass.Factory ? factoryUnitKinds(d, bdef.factory, bdef.race ?? 0).map((i) => ({ u: d.units[i], i })) : []);
  // amélioration possible (extracteur : niveau suivant ; assembleur : modèle suivant)
  const upg = $derived.by(() => {
    if (!info || !bdef || !d || (bdef.race ?? 0) !== 0) return null;
    if (bdef.cls === BClass.Depot) {
      const dp = d.depot;
      if (!dp || (info.level ?? 0) > 0) return null;
      return { label: "Agrandir le dépôt", cost: dp.upgradeCost, tech: dp.upgradeTech, time: dp.upgradeTime, gain: `${dp.cap[1]} de chaque objet au lieu de ${dp.cap[0]}, un étage de plus` };
    }
    if (bdef.cls === BClass.Power && d.generatorLevels && bdef.key === "generator") {
      const l = info.level ?? 0;
      const n = d.generatorLevels[l + 1];
      if (!n) return null;
      return { label: `Améliorer au niveau ${l + 2}`, cost: n.cost, tech: n.tech, time: n.time, gain: `production ${d.generatorLevels[l].prod} → ${n.prod} kW` };
    }
    // générateur principal : zone électrique agrandie, il reste en service pendant le chantier
    if (bdef.key === "main_generator" && d.mainGeneratorLevels) {
      const l = info.level ?? 0;
      const n = d.mainGeneratorLevels[l + 1];
      if (!n) return null;
      return { label: "Agrandir la zone électrique", cost: n.cost, tech: n.tech, time: n.time, gain: `zone ${d.mainGeneratorLevels[l].supply} → ${n.supply} cases`, running: true };
    }
    if (bdef.cls === BClass.Extractor) {
      const l = info.level ?? 0;
      const n = (d.extractorLevels ?? [])[l + 1];
      if (!n) return null;
      return { label: `Améliorer au niveau ${l + 2}`, cost: n.cost, tech: n.tech, time: n.time ?? 0, gain: `vitesse ×${(n.speed / 100).toFixed(1)}, énergie ×${(n.power / 100).toFixed(1)}` };
    }
    if (bdef.key === "furnace" && d.furnaceLevels) {
      const l = info.level ?? 0;
      const n = d.furnaceLevels[l + 1];
      if (!n) return null;
      return { label: `Améliorer au niveau ${l + 2}`, cost: n.cost, tech: n.tech, time: n.time, gain: `vitesse ×${(n.speed / 100).toFixed(1)}, ${Math.round((bdef.powerUse * n.power) / 100)} kW` };
    }
    const u = (d.assemblerUpgrades ?? []).find((x) => x[0] === sb?.kind);
    if (!u) return null;
    const to = d.buildings[u[1]];
    return { label: `Améliorer en ${to.name}`, cost: to.cost, tech: to.tech, time: u[2], gain: `vitesse ×${(to.speed / Math.max(1, bdef.speed)).toFixed(2)}, ${to.powerUse} kW` };
  });
  /** vitesse effective d'un fabricant : niveau de la fonderie compris (comme crafter_speed dans la simulation) */
  const cspeed = $derived(bdef ? (bdef.speed * (bdef.key === "furnace" ? (d?.furnaceLevels?.[info?.level ?? 0]?.speed ?? 100) : (info?.transh?.speed ?? 100))) / 100 : 100);
  const allRecipes = $derived(bdef && d && bdef.cls === BClass.Crafter ? d.recipes.map((r, i) => ({ r, i })).filter(({ r }) => r.crafter === bdef.crafter) : []);
  // seulement les recettes débloquées par nos recherches (les autres apparaissent dans l'écran des recettes)
  const recipes = $derived(allRecipes.filter(({ r }) => hasTechUI(r.tech)));
  const lockedRecipes = $derived(allRecipes.length - recipes.length);
  const total = $derived(ui.selUnits.reduce((s, g) => s + g.count, 0));
  /** bâtiments sélectionnés regroupés par type, dans l'ordre des types */
  const groupByKind = (list: { ref: number; kind: number; owner: number }[]) => {
    const m = new Map<number, { ref: number; kind: number; owner: number }[]>();
    for (const b of list) m.set(b.kind, [...(m.get(b.kind) ?? []), b]);
    return [...m].sort((a, b) => a[0] - b[0]);
  };
  const abbrev = (n: string) => n.split(/[\s-]/).map((w) => w[0]).join("").slice(0, 3).toUpperCase();
  /** machine ou usine terminée qu'on peut mettre en pause, et son état (enabled faux : en pause) */
  const canPause = $derived(!!info && !!bdef && mine && info.build >= 65536 && pausableClass(bdef.cls));
  /** sélection de plusieurs bâtiments : nos machines et usines terminées, et leur état de pause */
  const pausables = $derived(client.pausableSelection());
  const paused = $derived(!!info && !!bdef && pausableClass(bdef.cls) && info.enabled === false);
  // diagnostic : ce qui bloque le bâtiment, en clair
  const status = $derived.by(() => {
    // nid de la faune : son état (horde, risque d'attaque) a sa propre ligne
    if (!info || !bdef || !d || bdef.cls === BClass.Nest) return { text: "", kind: "" };
    if (info.build >= 65536 && info.souche?.soil?.spent) return { text: bdef.key === "taproot" ? `Épuisée : plus d'herbe autour, ${info.souche.soil.pct} % de sa production` : "À bout : l'herbe est loin, plantez-en au bord du terreau", kind: "warn" };
    if (info.build < 65536) return { text: `En construction ${Math.floor((info.build / 65536) * 100)} %` + (info.stalled ? " · en attente de matériaux" : ""), kind: info.stalled ? "warn" : "build" };
    if (paused) return { text: "En pause : ni énergie, ni ingrédients, ni production ; il reprendra là où il en était", kind: "paused" };
    if (info.upgrade > 0) return { text: `Amélioration en cours ${Math.floor(info.upgrade / 10)} % (${bdef.key === "main_generator" ? "toujours en service" : "arrêté"} pendant le chantier)`, kind: "build" };
    // un extracteur sur un gisement d'hydrocarbure n'a pas besoin d'électricité
    const powered = bdef.powerUse > 0 && !(bdef.cls === BClass.Extractor && info.recipe === HYDROCARBON);
    if (powered && !info.net) return { text: "Hors zone électrique : rapprochez-le d'un générateur ou d'un relais", kind: "warn" };
    if (powered && info.sat < 512) return { text: info.sat === 0 ? "Sans courant : les générateurs de la zone n'ont plus de combustible" : `Sous-alimenté (${Math.round((info.sat / 1024) * 100)} %) : il manque des générateurs ou du combustible`, kind: "warn" };
    // module des Transhumants : amélioration en cours d'installation
    if (info.transh?.mods?.job) return { text: `Installation d'une amélioration${bdef.cls === BClass.Depot || bdef.cls === BClass.Power ? " (toujours en service)" : " : à l'arrêt jusqu'à la fin"}`, kind: "build" };
    if (bdef.cls === BClass.Power && !["geothermal", "eppz_socket", "ark_dock"].includes(bdef.key) && (info.fuel ?? 0) <= 0 && info.build >= 65536) return { text: "Sans combustible : il ne produit rien", kind: "warn" };
    if (bdef.cls === BClass.Crafter && info.recipe !== RECIPE_NONE && !info.working) {
      const r = d.recipes[info.recipe];
      if (info.out + r.output[1] > Math.max(4, r.output[1] * 3)) return { text: `Sortie bloquée : ${d.items[r.output[0]].name} n'est pas emporté (bras ou tapis de sortie)`, kind: "warn" };
      const miss = r.inputs.filter(([, n], j) => info.inv[j] < n).map(([it]) => d.items[it].name);
      if (miss.length) return { text: `En attente de : ${miss.join(", ")}`, kind: "warn" };
    }
    if (bdef.cls === BClass.Extractor && info.out >= 5) return { text: "Sortie bloquée : le minerai n'est pas emporté", kind: "warn" };
    if (bdef.cls === BClass.Factory && info.queue.length && !info.working) {
      const u = d.units[info.queue[0][0]];
      // une entrée de file : une unité, ou la portée entière d'un organisme de la Souche
      const k = Math.max(1, u.litter ?? 0);
      // couveuse : elle ne paie rien (ses œufs paient), elle attend de la place ou un réseau
      if (u.litter) return { text: info.net ? "En attente : trois portées couvent déjà" : "Hors de tout réseau : elle ne pond pas", kind: "warn" };
      const lack = u.cost.filter(([it, n]) => (info.stash[it] ?? 0) < n * k);
      const miss = lack.map(([it, n]) => `${n * k - (info.stash[it] ?? 0)} ${d.items[it].name}`);
      // ce que les dépôts à portée des drones de l'usine ont encore (voir drones::site_missing)
      const near = new Map(((info.missing ?? []) as number[][]).map(([it, , n]) => [it, n]));
      const empty = lack.some(([it]) => (near.get(it) ?? 0) <= 0);
      const how = empty ? `vos dépôts à moins de ${d.depot?.factorySupply ?? 30} cases n'en ont pas assez : amenez-en, ou un tapis` : "ses drones les apportent";
      if (miss.length) return { text: `En attente de : ${miss.join(", ")} (${how})`, kind: "warn" };
    }
    if (bdef.cls === BClass.Lab && !info.working && ui.research) return { text: `En attente ${bdef.race === 1 ? "d'ADN" : bdef.race === 2 ? "de relevés" : "de lots de recherche"}`, kind: "warn" };
    const low = bdef.powerUse > 0 && !(bdef.cls === BClass.Extractor && info.recipe === HYDROCARBON) && info.sat < 900 ? ` · énergie ${Math.round((info.sat / 1024) * 100)} %` : "";
    // en marche : performance de la dernière minute (débit réel rapporté au maximum de la machine)
    const perf = info.flowMax > 0 && (bdef.cls === BClass.Crafter || bdef.cls === BClass.Extractor) ? Math.min(100, Math.round((info.flow / info.flowMax) * 100)) : null;
    const perfTxt = perf !== null ? ` · ${perf} % de performance sur la dernière minute` : "";
    return info.working ? { text: "En marche" + perfTxt + low, kind: low || (perf !== null && perf < 50) ? "warn" : "good" } : { text: "En attente" + low, kind: "idle" };
  });
  /** Débit d'un fabricant : objets par minute à pleine vitesse, et au niveau d'énergie actuel. */
  const rate = $derived.by(() => {
    // extracteur : débit calculé par la simulation (dixièmes d'objet par minute) ; nul si la sortie est bloquée
    if (info && bdef && bdef.cls === BClass.Extractor && info.extractMax) {
      return { max: info.extractMax / 10, now: info.working && info.out < 5 ? info.extractNow / 10 : 0, item: info.recipe };
    }
    if (!info || !bdef || !d || bdef.cls !== BClass.Crafter || info.recipe === RECIPE_NONE) return null;
    const r = d.recipes[info.recipe];
    const ticks = (r.time * 100) / Math.max(1, cspeed);
    const max = (1200 / ticks) * r.output[1];
    return { max, now: info.working ? max * Math.min(1, (info.sat ?? 1024) / 1024) : 0, item: r.output[0] };
  });
  /** Débit moyen de la dernière minute, compté par la simulation (dixièmes par minute) : ce qui a vraiment été produit. */
  const FLOW_UNIT: Partial<Record<number, string>> = {
    [BClass.Extractor]: "objets",
    [BClass.Crafter]: "objets",
    [BClass.Factory]: "unités",
    [BClass.Lab]: "cycles de recherche",
    [BClass.Depot]: "objets reçus",
    [BClass.Inserter]: "objets déplacés",
  };
  const flow = $derived.by(() => {
    if (!info || !bdef || info.build < 65536 || info.flow === undefined) return null;
    const unit = FLOW_UNIT[bdef.cls];
    // rendement : débit réel de la dernière minute rapporté au débit maximal (pleine énergie), calculé par la simulation
    const pct = info.flowMax > 0 ? Math.min(100, Math.round((info.flow / info.flowMax) * 100)) : null;
    return unit ? { v: info.flow / 10, unit, item: rate?.item, pct, max: (info.flowMax ?? 0) / 10 } : null;
  });
  /** Caractéristiques d'une recette dans ce bâtiment, à son niveau et à sa cadence : durée d'un cycle (s), énergie par cycle (kJ), objets par minute. */
  const recipeSpec = (r: { time: number; output: [number, number] }) => {
    const secs = r.time / 20 / (Math.max(1, (cspeed * (info?.clock ?? 100)) / 100) / 100);
    return { secs, energy: (info?.kwMax || bdef?.powerUse || 0) * secs, perMin: (60 / secs) * r.output[1] };
  };
  const fmt1 = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const fmtX = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  /** Multiplicateurs d'une machine (vitesse et énergie) : niveau, pureté du gisement, cadence. */
  const machineMults = $derived.by(() => {
    if (!info || !bdef || !d) return null;
    const lv = info.level ?? 0;
    const lvl = bdef.key === "furnace" ? d.furnaceLevels?.[lv] : bdef.cls === BClass.Extractor ? d.extractorLevels?.[lv] : null;
    return { speed: (lvl?.speed ?? 100) / 100, power: (lvl?.power ?? 100) / 100, purity: (info.purity || 100) / 100, clock: (info.clock ?? 100) / 100, clockPower: (info.clockPower ?? 1000) / 1000, lv: lvl ? lv + 1 : 0 };
  });
  /** Niveau actuel, pour la carte d'amélioration. */
  const upgCur = $derived.by(() => {
    if (!info || !bdef || !d) return "";
    const lv = info.level ?? 0;
    if (bdef.key === "furnace" && d.furnaceLevels?.[lv]) return `niveau ${lv + 1} sur ${d.furnaceLevels.length} : vitesse ×${fmtX(d.furnaceLevels[lv].speed / 100)}, ${Math.round((bdef.powerUse * d.furnaceLevels[lv].power) / 100)} kW`;
    if (bdef.cls === BClass.Extractor && d.extractorLevels?.[lv]) return `niveau ${lv + 1} sur ${d.extractorLevels.length} : vitesse ×${fmtX(d.extractorLevels[lv].speed / 100)}, énergie ×${fmtX(d.extractorLevels[lv].power / 100)}`;
    if (bdef.key === "generator" && d.generatorLevels?.[lv]) return `niveau ${lv + 1} sur ${d.generatorLevels.length} : ${d.generatorLevels[lv].prod} kW`;
    return "";
  });
  /** cadence possible : de 10 à 250 %, avec assez de fragments (ceux de la machine et ceux en réserve) */
  const clockOk = (c: number, installed: number) => c >= 10 && c <= 250 && Math.max(0, Math.ceil((c - 100) / 50)) <= installed + ui.shards;
  const fmtE = (kj: number) => (kj >= 1000 ? `${(kj / 1000).toFixed(1)} MJ` : `${Math.round(kj)} kJ`);
  const STATE = ["à quai", "en route vers la destination", "à quai à destination", "en retour"];
  const isStation = $derived(!!bdef && (bdef.cls === BClass.Station || bdef.cls === BClass.CargoPad));
  const NI = $derived(d?.items.length ?? 27);
  const stashList = (recv: boolean) => (info?.stash?.length ? (info.stash as number[]).slice(recv ? NI : 0, recv ? 2 * NI : NI).map((n, i) => ({ i, n })).filter((x) => x.i > 0 && x.n > 0) : []);
  const hpf = $derived(info && bdef ? info.hp / bdef.hp : 1);
  /** Statistiques d'un type d'unité (fiche d'une unité étrangère) : portée (cases), dégâts par seconde, vitesse (cases/s). */
  const unitStats = (k: number) => {
    const u = d!.units[k];
    const ws = u.weapons.map((i) => d!.weapons[i]).filter(Boolean);
    const dps = ws.reduce((t, w) => t + (w.dmg * Math.max(1, w.salvo) * Math.max(1, w.sustain) * 20) / Math.max(1, w.cooldown), 0);
    return { u, range: ws.length ? Math.max(...ws.map((w) => w.range)) : 0, dps, speed: (u.speed * 20) / 256 };
  };
  /** la faune est le propriétaire caché qui suit les vrais joueurs */
  const isFauna = (o: number) => ui.players.length > 0 && o >= ui.players.length;
  const ownerName = (o: number) => (isFauna(o) ? "Faune" : (ui.names[o] ?? ""));
  const hexOf = (o: number) => "#" + (isFauna(o) ? NATURE_COLOR : PLAYER_COLORS[o % 8]).toString(16).padStart(6, "0");
  const foreignColor = $derived(ui.selForeign >= 0 ? hexOf(ui.selForeign) : "");
  const enemyTeam = $derived(ui.selForeign >= 0 && (ui.players[ui.selForeign]?.team ?? -1) !== (ui.players[ui.me]?.team ?? -2));
  const dep = $derived(ui.selDeposit);
  const depUser = $derived(dep ? (ui.tick, client.depositUser()) : null);
  const owner = $derived(sb ? hexOf(sb.owner) : "");
  /** nid de la faune : [bêtes au nid, plafond, seuil d'attaque, âge (s), évolution ‰, pression, chance ‰] */
  const nest = $derived(info?.nest as number[] | null | undefined);
  /** ruine des Anciens : [EPPZ présent, joueur qui capture (-1), avancement ‰] */
  const ruin = $derived(info?.ruin as number[] | null | undefined);
  /** tapis : objets sur la case (de l'avant vers l'arrière) et sur toute la file (objet, nombre) */
  const belt = $derived(info?.belt as { tile: number[]; line: [number, number][]; tiles: number; cap: number; jam: number; powered: boolean } | null | undefined);
  // choix de recette : la grille ne s'ouvre que par « Changer de recette » (ou si aucune n'est choisie) ;
  // elle se referme quand on sélectionne un autre bâtiment
  let picking = $state(false);
  let pickFor = -1;
  $effect(() => {
    const r = ui.selBuilding?.ref ?? -1;
    if (r !== pickFor) {
      pickFor = r;
      picking = false;
    }
  });
</script>

{#if sb && bdef && d}
  <div class="panel sel">
    <div class="head" style:--pc={owner}>
      <div class="thumb">{#if sprite("buildings", bdef.key)}<img src={sprite("buildings", bdef.key)} alt="" />{/if}</div>
      <div class="ht">
        <div class="kicker">{ownerName(sb.owner)}</div>
        <b class="title">{bdef.name}</b>
        {#if info}
          <div class="hpline"><span class="hp" class:mid={hpf < 0.6} class:low={hpf < 0.3}><span style:width={hpf * 100 + "%"}></span></span><span class="num small">{info.hp}/{bdef.hp}</span></div>
        {/if}
      </div>
    </div>
    {#if BUILDING_DESCS[bdef.key]}<p class="udesc small">{BUILDING_DESCS[bdef.key]}</p>{/if}
    {#if status.text || canPause}
      <div class="stline">
        {#if status.text}<div class="status {status.kind}"><span class="led"></span>{status.text}</div>{/if}
        {#if canPause}
          <button class="icon-btn pausebtn" class:resume={paused} title={paused ? "Relancer : la machine reprend là où elle en était (cycle en cours et contenu gardés)" : "Mettre en pause : plus d'énergie, plus d'ingrédients ni de production ; le contenu et le cycle en cours sont gardés. Vaut aussi pour une sélection de plusieurs bâtiments."} onclick={() => client.togglePauseSelected()}><Icon name={paused ? "play" : "pause"} size={13} /> {paused ? "Reprendre" : "Pause"} {#if keyOf("pauseBuilding")}<span class="key">{keyOf("pauseBuilding")}</span>{/if}</button>
        {/if}
      </div>
    {/if}
    {#if nest && nest.length && nest[0] === -1}
      <!-- nid greffé (apprivoisé par une Reine de la Souche) -->
      {@const [, brood, cap, next, have, lim] = nest}
      <div class="sgrid small nest">
        <span class="dim">Mordeurs du nid</span><span class="num">{brood}</span>
        <span class="dim">Prochaine portée</span><span class="num">{brood >= cap ? `aucune (${cap} mordeurs au plus, œufs compris)` : `3 œufs dans ${next} s`}</span>
        <span class="dim">Nids greffés</span><span class="num">{have} / {lim}</span>
      </div>
      <div class="status good"><span class="led"></span>Nid greffé : il pond des portées de 3 œufs de mordeurs, sans coût. Clic droit au sol : point de ralliement</div>
    {:else if nest && nest.length}
      {@const [home, max, need, age, evo, press, chance, tamer = -1, tame = 0] = nest}
      {#if tamer >= 0}
        <div class="tamebar"><span style="width: {tame / 10}%"></span></div>
        <div class="status {tamer === ui.me ? 'good' : 'warn'}"><span class="led"></span>Apprivoisé par {tamer === ui.me ? "votre Reine" : `la Reine de ${ui.names[tamer] ?? "un adversaire"}`} : {Math.floor(tame / 10)} %</div>
      {/if}
      <div class="sgrid small nest">
        <span class="dim">Horde au nid</span><span class="num">{home} / {max}</span>
        <span class="dim">Attaque dès</span><span class="num">{need} bêtes</span>
        <span class="dim">Âge du nid</span><span class="num">{Math.floor(age / 60)} min</span>
        <span class="dim">Évolution</span><span class="num">{(evo / 10).toFixed(0)} %</span>
        <span class="dim">Bâtiments proches</span><span class="num">{press ? `pression ${press}` : "aucun"}</span>
        <span class="dim">Risque d'attaque</span><span class="num">{chance ? `${(chance / 10).toFixed(1)} % / 10 s` : "nul"}</span>
      </div>
      <div class="status {home >= need && chance ? 'warn' : 'build'}"><span class="led"></span>{home >= need ? (chance ? "Horde prête : elle peut attaquer à tout moment" : "Horde prête, mais aucun bâtiment ne l'inquiète") : `La horde grossit : ${need - home} bête${need - home > 1 ? "s" : ""} avant de pouvoir attaquer`}</div>
    {/if}
    {#if ruin && ruin.length}
      {@const [has, holder, prog] = ruin}
      {#if has}
        <div class="status {holder === ui.me ? 'good' : holder >= 0 ? 'warn' : 'idle'}"><span class="led"></span>{holder < 0 ? "EPPZ en place : approchez seul des unités terrestres (4 cases) pendant 10 s pour le capturer" : `Capture par ${holder === ui.me ? "vous" : (ui.names[holder] ?? "un adversaire")} : ${Math.floor(prog / 10)} %`}</div>
      {:else}
        <div class="status idle"><span class="led"></span>L'EPPZ a été emporté</div>
      {/if}
    {/if}
    {#if info && info.build < 65536 && (info.missing ?? []).length}
      <!-- chantier : ce qui manque encore, et ce que les dépôts proches en ont (drones des constructeurs) -->
      <div class="row wrap"><span class="kicker">Manque</span>
        {#each info.missing as [it, n, near]}<span class="miss tip"><Item id={it} n={n} size={18} /><span class="small num" class:bad={near < n} class:dim={near >= n}>{near} à portée</span><span class="tt"><b>{d.items[it]?.name}</b><br /><span class="num">{n}</span> encore à apporter<br /><span class="num">{near}</span> dans vos dépôts à moins de {d.depot?.near ?? 30} cases</span></span>{/each}
      </div>
      <span class="dim small"><Icon name="logistics" size={12} /> Les drones de vos constructeurs vont chercher les matériaux dans les dépôts proches ; un ingénieur emporte d'abord ce qui manque aux environs du chantier.</span>
    {/if}
    {#if mine && info}
      {#if info.build < 65536}
        <button class="icon-btn danger" onclick={() => client.cancelBuilding()}><Icon name="close" size={14} /> Annuler le chantier {#if keyOf("cancelBuilding")}<span class="key">{keyOf("cancelBuilding")}</span>{/if}</button>
      {:else if bdef.key === "ark_dock"}
        <span class="dim small">L'Arche le rembarque en partant.</span>
      {:else if (bdef.race ?? 0) === 2 && bdef.key !== "t_pole"}
        <button class="icon-btn" title="Le module redevient un chenillard (immobile 10 s) ; son contenu retourne à la réserve, sa recette et son combustible restent à bord" onclick={() => client.packSelected()}><Icon name="deploy" size={14} /> Replier</button>
      {:else}
        <button class="icon-btn danger" title="Démonté par vos constructeurs les plus proches : les matériaux vont dans leur soute, puis leurs drones les rapportent à un dépôt" onclick={() => client.demolishSelected()}><Icon name="reclaim" size={14} /> Démolir {#if keyOf("cancelBuilding")}<span class="key">{keyOf("cancelBuilding")}</span>{/if}</button>
      {/if}
      {#if info.souche}
        {@const sv = info.souche}
        <div class="row small" title="Chaque réseau de racines a sa propre réserve : ses organes poussent et ses couveuses pondent avec elle. Une racine coupée partage la réserve entre les morceaux.">
          <span class="kicker">Réseau</span>
          {#if sv.net}
            <Item id={27} size={16} /> <span class="num">{sv.seve}</span> <Item id={28} size={16} /> <span class="num">{sv.sels}</span> <span class="dim">/ <span class="num">{sv.store}</span></span>
          {:else if !sv.heart}<b class="bad">hors du terreau : rien ne pousse</b>{:else}<span class="dim">le sien, une fois poussée</span>{/if}
        </div>
        {#if sv.heart}
          <div class="row small" title="Une graine-mère ne pousse que des organismes qui s'y sacrifient. Chacun rapporte son prix en sève."><span class="kicker">Sacrifices</span> <Item id={SEVE} size={16} /> <b class="num">{sv.heart.fed.toLocaleString("fr-FR")}</b><span class="dim"> / <span class="num">{sv.heart.need.toLocaleString("fr-FR")}</span> sève</span></div>
          <div class="upbar"><span style="width: {(sv.heart.fed / sv.heart.need) * 100}%"></span></div>
          <span class="dim small">Sélectionnez des organismes et clic droit ici : ils s'y dissolvent (une carapace vaut 120 sève, un rongeur 25). Une couveuse ralliée sur elle lui envoie ce qui naît.</span>
        {/if}
        {#if sv.far}<div class="row small" title="Racines et rhizomes coûtent 2 % de plus par case qui les sépare de la graine-mère la plus proche (fixé à la plantation)"><span class="kicker">Distance</span> <span class="num">{sv.far / 2}</span> cases de la graine-mère <span class="dim">· coût +{sv.far} %</span></div>{/if}
        {#if sv.soil}
          {@const so = sv.soil}
          <div class="row small" title="C'est l'herbe mangée (tout sol qui n'est pas du terreau) qui donne la sève : chaque case rapporte autant, mais prend de plus en plus de temps quand elle est loin. Les organes qui convoitent la même herbe se la partagent."><span class="kicker">Débit</span> <b class="num" class:bad={so.rate < 300}>{Math.round(so.rate / 10)} %</b>{#if so.near >= 0}<span class="dim">· herbe à <span class="num">{so.near}</span> cases, une toutes les <span class="num">{so.secs}</span> s</span>{:else}<span class="bad">· plus d'herbe</span>{/if}</div>
          {#if so.near >= 0 && so.share < 950}<div class="row small"><span class="kicker">Part</span> <span class="num">{Math.round(so.share / 10)} %</span><span class="dim"> : d'autres organes convoitent la même herbe</span></div>{/if}
          {#if so.total}
            <div class="row small"><span class="kicker">Herbe du périmètre</span> <b class="num" class:bad={so.left < 15}>{so.left}</b><span class="dim"> / <span class="num">{so.total}</span> cases{so.left ? ` · ≈ ${Math.max(1, Math.round(so.all / 60))} min` : ""}</span></div>
            <div class="upbar"><span style="width: {(so.left / Math.max(1, so.total)) * 100}%"></span></div>
          {/if}
        {/if}
        {#if sv.hatch >= 0}
          <div class="row small"><span class="kicker">Éclosion</span> <b>Béhémoth</b> <span class="num">{sv.hatch > 0 ? `dans ${Math.ceil(sv.hatch / 20)} s` : "dès qu'il y a de la place sous la limite d'unités"}</span></div>
          <div class="upbar"><span style="width: {100 - sv.hatch / 4}%"></span></div>
        {/if}
        {#if info.adapt?.known}
          {@const ad = info.adapt}
          {@const got = [0, 1, 2, 3, 4].filter((k) => ad.bits & (1 << k)).length}
          {@const adn = ui.stock[ADN] ?? 0}
          <div class="adapt">
            <div class="row small" title="L'espèce entière devient résistante ({ad.pct} % de dégâts en moins) à une famille d'armes qui a assez blessé vos organismes. Trois familles au plus, pour toute la partie."><span class="kicker">Caractères acquis</span> <span class="num">{got} / {ad.max}</span>{#if got < ad.max}<span class="dim">· prochain : <Item id={ADN} n={ad.cost} size={14} /></span>{/if}</div>
            {#each ADAPT_FAMILIES as name, k}
              {@const own = (ad.bits & (1 << k)) !== 0}
              {@const pct = Math.min(100, Math.floor((ad.scars[k] / ad.min) * 100))}
              <div class="row small fam">
                <span class="fname" class:good={own}>{name}</span>
                {#if own}<span class="good">−{ad.pct} %</span>
                {:else if pct < 100}<span class="dim num" title="Dégâts de cette famille subis par vos organismes">{ad.scars[k].toLocaleString("fr-FR")} / {ad.min.toLocaleString("fr-FR")}</span>
                {:else}<button class="icon-btn" disabled={got >= ad.max || adn < ad.cost} title={got >= ad.max ? "Trois caractères acquis au plus" : adn < ad.cost ? `Il faut ${ad.cost} ADN` : "Fixer cette résistance dans l'espèce"} onclick={() => client.adapt(k)}>Fixer</button>{/if}
              </div>
            {/each}
          </div>
        {/if}
        {#if sv.rateSeve || sv.rateSels}
          <div class="row small"><span class="kicker">Production</span>{#if sv.rateSeve}<Item id={27} size={16} /> <span class="num">{(sv.rateSeve / 100).toLocaleString("fr-FR")}</span>/s{/if}{#if sv.rateSels} <Item id={28} size={16} /> <span class="num">{(sv.rateSels / 100).toLocaleString("fr-FR")}</span>/s{/if}{#if bdef.key === "leaves"}<span class="dim"> · les frondaisons voisines (4 cases) se font de l'ombre</span>{/if}</div>
        {/if}
      {/if}
      {#if info.transh?.mods}<Upgrades mi={info.transh.mods} refs={[sb.ref]} />{/if}
      {#if info.transh?.cartsMax}
        {@const tc = info.transh}
        <div class="row small" title="Un chariot de convoi fait la navette entre cette soute et un module éloigné : clic droit sur une foreuse ou un fabricant pour rapporter ce qui en sort, Maj+clic droit sur un fabricant pour lui livrer les ingrédients de sa recette. Les chariots rentrent dans la soute quand elle se replie.">
          <span class="kicker">Chariots</span> <b class="num">{tc.carts}</b><span class="dim"> / <span class="num">{tc.cartsMax}</span></span>
          {#if tc.carts < tc.cartsMax}<button class="icon-btn" onclick={() => client.hitchCart()} title="Atteler un chariot de convoi, payé avec le stock de cette soute">Atteler un chariot {#each tc.cartCost as [it, n]}<Item id={it} n={n} size={14} />{/each}</button>{/if}
        </div>
      {/if}
      {#if info.transh?.poles}
        {@const tp = info.transh}
        <div class="row small" title="Chaque poteau planté agrandit la zone électrique du générateur ({tp.poleReach} cases au plus entre deux poteaux). Le générateur les rembarque quand il se replie.">
          <span class="kicker">Poteaux</span> <b class="num">{tp.poles.length}</b><span class="dim"> / <span class="num">{tp.polesMax}</span></span>
          {#if tp.poles.length < tp.polesMax}<button class="icon-btn" onclick={() => client.startPole()} title="Planter un poteau relais : à {tp.poleReach} cases au plus du générateur ou d'un de ses poteaux ; Maj+clic pour en planter plusieurs"><Icon name="power" size={14} /> Planter un poteau</button>{/if}
        </div>
      {/if}
      {#if info.transh && info.transh.wear >= 0}
        <div class="row small" title="La foreuse nomade extrait deux fois plus vite qu'un extracteur, mais use le gisement : son débit baisse jusqu'à 60 %. Le gisement se reconstitue quand on le laisse."><span class="kicker">Usure du gisement</span> <b class="num" class:bad={info.transh.wear >= 400}>{Math.round(info.transh.wear / 10)} %</b><span class="dim"> · débit ×<span class="num">{((2000 - 2 * info.transh.wear) / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</span></span></div>
      {/if}
      {#if info.clockable && info.build >= 65536}
        {@const ck = info.clock ?? 100}
        {@const inst = info.shards ?? 0}
        <div class="row small clock" title="Cadence de la machine : plus vite, mais la consommation électrique croît plus vite encore (×2,5 à 200 %). Au-dessus de 100 %, il faut un fragment d'énergie par tranche de 50 % ; on en gagne en détruisant des nids de la faune.">
          <span class="kicker">Cadence</span>
          <button class="icon-btn" disabled={!mine || !clockOk(ck - 10, inst)} aria-label="Ralentir" onclick={() => client.setClock(ck - 10)}>−</button>
          <b class="num">{ck} %</b>
          <button class="icon-btn" disabled={!mine || !clockOk(ck + 10, inst)} aria-label="Accélérer" title={ck < 250 && !clockOk(ck + 10, inst) ? `Au-delà de ${ck} % : il faut un fragment d'énergie de plus (un par tranche de 50 % au-dessus de 100 %). Détruisez un nid de la faune pour en gagner.` : "Accélérer"} onclick={() => client.setClock(ck + 10)}>+</button>
          <span class="dim">· énergie ×<span class="num">{((info.clockPower ?? 1000) / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</span></span>
          <span class="dim nowrap">· fragments <span class="num">{inst}</span> installé{inst > 1 ? "s" : ""}, <span class="num">{ui.shards}</span> en réserve</span>
        </div>
      {/if}
      {#if info.build >= 65536 && info.kwMax > 0 && (bdef.cls === BClass.Crafter || bdef.cls === BClass.Extractor) && machineMults}
        {@const m = machineMults}
        <div class="row small" title={`${bdef.powerUse} kW de base${m.lv ? ` × ${fmtX(m.power)} (niveau ${m.lv})` : ""} × ${fmtX(m.clockPower)} (cadence ${Math.round(m.clock * 100)} %)`}><span class="kicker">Énergie</span> <b class="num">{info.kwMax}</b> kW à pleine marche</div>
      {/if}
      {#if info.purity}
        <div class="row small"><span class="kicker">Pureté</span> <b class="purity p{info.purity}">{info.purity >= 200 ? "Pur" : info.purity <= 50 ? "Impur" : "Normal"}</b><span class="dim num">· rendement ×{(info.purity / 100).toLocaleString("fr-FR")}</span></div>
      {/if}
      {#if bdef.key === "geothermal" && info.build >= 65536}
        {@const out = info.genOut ?? 0}
        {@const base = Math.round((bdef.powerProd * (info.purity || 100) * (info.clock ?? 100)) / 10000)}
        <div class="row small"><span class="kicker">Fournit</span> <span class="num">{out}</span> kW <span class="dim">· de <span class="num">{Math.round(base / 2)}</span> à <span class="num">{Math.round(base * 1.5)}</span> kW selon le geyser</span></div>
        <span class="dim small">Sans combustible : la vapeur du geyser monte et retombe en une minute, la production suit (moyenne <span class="num">{base}</span> kW).</span>
      {:else if (bdef.key === "eppz_socket" || bdef.key === "ark_dock") && info.build >= 65536}
        {@const out = info.genOut ?? 0}
        <div class="row small"><span class="kicker">Fournit</span> <span class="num">{out}</span> / <span class="num">{Math.round((bdef.powerProd * (info.clock ?? 100)) / 100)}</span> kW</div>
        <span class="dim small">{bdef.key === "ark_dock" ? "Relié à l'Arche" : "EPPZ installé"} : aucune combustion, la production ne s'épuise pas.</span>
      {:else if bdef.cls === BClass.Power && info.build >= 65536}
        {@const gl = d.generatorLevels && bdef.key === "generator" ? d.generatorLevels : null}
        {@const main = bdef.key === "main_generator"}
        {@const ml = main ? d.mainGeneratorLevels : null}
        {@const kw = Math.round(((info.upgrade > 0 && !main ? 0 : gl ? gl[Math.min(info.level ?? 0, gl.length - 1)].prod : info.transh?.kw || bdef.powerProd) * (info.clock ?? 100)) / 100)}
        {@const fu = d.fuel}
        {@const cell = bdef.key === "crystal_reactor"}
        {@const unit = fu ? (cell ? fu.cell : fu.hydrocarbon) : 0}
        {@const tank = info.fuelTank ?? 0}
        {@const fuel = info.fuel ?? 0}
        {@const out = info.genOut ?? 0}
        <div class="row small"><span class="kicker">Combustible</span> <Item id={cell ? ENERGY_CELL : HYDROCARBON} size={16} />
          <span class="fuelbar" class:empty={fuel <= 0}><span style:width={tank ? (100 * fuel) / tank + "%" : "0"}></span></span>
          {#if unit}<span class="nowrap"><span class="num">{(fuel / unit).toFixed(1)}</span><span class="dim"> / {(tank / unit).toFixed(0)}</span></span>{/if}
          {#if fuel > 0 && out > 0}<span class="dim"> · encore <span class="num">{Math.ceil(fuel / out / 20)}</span> s à cette charge</span>{/if}
        </div>
        <div class="row small"><span class="kicker">Fournit</span> <span class="num">{out}</span> / <span class="num">{kw}</span> kW{#if gl} <span class="dim">· niveau {(info.level ?? 0) + 1}/{gl.length}</span>{/if}{#if info.upgrade > 0 && !main} <span class="dim">(arrêté pendant l'amélioration)</span>{/if}</div>
        {#if ml}
          {@const lv = Math.min(info.level ?? 0, ml.length - 1)}
          <div class="row small"><span class="kicker">Zone</span> <span class="num">{ml[lv].supply}</span> cases autour <span class="dim">· niveau {lv + 1}/{ml.length}</span></div>
        {/if}
        <span class="dim small">Brûle {cell ? "des cellules d'énergie" : "de l'hydrocarbure, ou du carburant (5 fois plus d'énergie)"}, d'autant plus vite que sa zone consomme.</span>
      {/if}
      {#if flow && bdef.cls !== BClass.Crafter && bdef.cls !== BClass.Extractor}
        <div class="row small" title="Moyenne de ce qui a été réellement produit pendant la dernière minute"><span class="kicker">Dernière minute</span> {#if flow.item}<Item id={flow.item} size={16} />{/if} <span class="num">{flow.v.toFixed(1)}</span> {flow.unit}/min{#if flow.pct !== null} <span class="num pct" class:good={flow.pct >= 90} class:warn={flow.pct < 50}>{flow.pct} %</span> <span class="dim">du max ({flow.max.toFixed(1)}/min)</span>{/if}</div>
      {/if}
      {#if info.twins}
        <div class="row small twins" title="Deux machines identiques collées qui fabriquent la même chose se dépannent : ingrédients et produits passent de l'une à l'autre quand ses bras et tapis ne suffisent pas"><span class="kicker">Jumelée</span> {bdef.cls === BClass.Crafter ? "ingrédients et produits partagés" : bdef.cls === BClass.Power ? "combustible partagé" : "ingrédients partagés"} avec {bdef.cls === BClass.Power ? (info.twins === 1 ? "le générateur collé" : `${info.twins} générateurs collés`) : info.twins === 1 ? "la machine collée" : `${info.twins} machines collées`}</div>
      {/if}
      {#if belt}
        {@const slots = belt.tiles ? belt.cap / belt.tiles : 4}
        {@const onLine = belt.line.reduce((s, [, n]) => s + n, 0)}
        <div class="belt">
          <div class="row small"><span class="kicker">Sur cette case</span>
            <span class="lane" title="Objets sur cette case, dans le sens de la marche">
              {#each Array(Math.max(0, slots - belt.tile.length)) as _}<span class="bslot"></span>{/each}
              {#each [...belt.tile].reverse() as it}<span class="bslot full"><Item id={it} size={18} /></span>{/each}
              <span class="arrow">▸</span>
            </span>
            <span class="num dim">{belt.tile.length}/{slots}</span>
          </div>
          <div class="row small wrap"><span class="kicker">Sur la file</span>
            {#each belt.line as [it, n]}<span class="tip"><Item id={it} {n} size={16} /><span class="tt">{d.items[it]?.name} : {n}</span></span>{:else}<span class="dim">vide</span>{/each}
            <span class="dim num">· {onLine}/{belt.cap} sur {belt.tiles} case{belt.tiles > 1 ? "s" : ""}</span>
          </div>
          {#if belt.jam >= slots}<div class="status warn"><span class="led"></span>Sortie bouchée : {belt.jam} objets à l'arrêt en bout de file</div>{/if}
        </div>
      {/if}
      {#if bdef.cls === BClass.Crafter}
        <div class="rhead">
          <span class="kicker">Recette</span>
          {#if info.recipe !== RECIPE_NONE && !picking}
            <button class="icon-btn small" onclick={() => (picking = true)}><Icon name="repeat" size={13} /> Changer de recette</button>
          {:else if picking}
            <button class="icon-btn small ghost" onclick={() => (picking = false)}><Icon name="close" size={13} /> Annuler</button>
          {/if}
        </div>
        {#if info.recipe === RECIPE_NONE || picking}
        <div class="recipes">
          <button class="rc none" class:on={info.recipe === RECIPE_NONE} onclick={() => { client.setRecipe(RECIPE_NONE); picking = false; }}>
            <span class="dim small">{bdef.crafter === 1 ? "Aucune" : "Automatique"}</span>
            {#if bdef.crafter !== 1}<span class="dim tiny">selon le minerai reçu</span>{/if}
          </button>
          {#each recipes as { r, i }}
            {@const ok = hasTechUI(r.tech)}
            {@const s = recipeSpec(r)}
            <div class="tip">
              <button class="rc" class:on={info.recipe === i} class:locked={!ok} disabled={!ok} onclick={() => { client.setRecipe(i); picking = false; }}>
                <span class="rflow">
                  <span class="rin">{#each r.inputs as [it, n]}<Item id={it} n={n} size={18} />{/each}</span>
                  <span class="arrow">▸</span>
                  <Item id={r.output[0]} n={r.output[1]} size={24} />
                </span>
                <span class="rname">{d.items[r.output[0]].name}</span>
                <span class="rmeta num"><span><Icon name="power" size={11} />{fmtE(s.energy)}</span><span><Icon name="clock" size={11} />{s.secs.toFixed(1)} s</span></span>
                {#if !ok}<span class="lk"><Icon name="lock" size={12} /></span>{/if}
              </button>
              <div class="tt">
                <b>{d.items[r.output[0]].name} ×{r.output[1]}</b>{#if !ok}<br /><span class="bad"><Icon name="lock" size={12} /> Recherche : {d.techs[r.tech]?.name}</span>{/if}<br />
                <span class="dim">Coût :</span> {r.inputs.map(([it, n]) => `${n} ${d.items[it].name}`).join(", ")}<br />
                <span class="dim">Durée :</span> <span class="num">{s.secs.toFixed(1)} s</span> · <span class="dim">énergie :</span> <span class="num">{fmtE(s.energy)}</span> ({bdef.powerUse} kW)<br />
                <span class="dim">Production :</span> <span class="num">{s.perMin.toFixed(1)}</span>/min · <span class="dim">consommation :</span> {r.inputs.map(([it, n]) => `${((n * 60) / s.secs).toFixed(1)} ${d.items[it].name}`).join(", ")} /min
              </div>
            </div>
          {/each}
        </div>
        {#if lockedRecipes}<button class="ghost rlock small" onclick={() => (ui.showRecipes = true)}><Icon name="lock" size={12} /> {lockedRecipes} recette{lockedRecipes > 1 ? "s" : ""} à débloquer par la recherche</button>{/if}
        {/if}
        {#if info.recipe !== RECIPE_NONE && d.recipes[info.recipe] && !picking}
          {@const r = d.recipes[info.recipe]}
          {@const fmax = (info.flowMax ?? 0) / 10}
          {@const fnow = (info.flow ?? 0) / 10}
          {@const pct = fmax > 0 ? Math.min(100, Math.round((fnow / fmax) * 100)) : 0}
          {@const m = machineMults}
          <div class="flow">
            {#each r.inputs as [it, n], j}<span class="tip slot"><Item id={it} n={info.inv[j]} need={n} size={22} /><span class="tt">Entrée : {d.items[it].name}, {info.inv[j]} en attente (il en faut {n} par cycle)</span></span>{/each}
            <span class="arrow">▸▸</span>
            <span class="tip slot out"><Item id={r.output[0]} n={info.out} size={26} /><span class="tt">Sortie : {d.items[r.output[0]].name}, {info.out} prêt{info.out > 1 ? "s" : ""} à partir</span></span>
          </div>
          <div class="row small" title="Ce qui a vraiment été produit pendant la dernière minute, rapporté au maximum de la machine"><span class="kicker">Débit</span> <Item id={r.output[0]} size={16} /> <b class="num">{fmt1(fnow)}</b> /min sur la dernière minute · <span class="num pct" class:good={pct >= 90} class:warn={pct < 50}>{pct} %</span> <span class="dim">du max</span></div>
          <div class="perfbar"><span style:width={pct + "%"}></span></div>
          <div class="row small" title={m ? `${fmt1((1200 / r.time) * r.output[1] * ((bdef.speed ?? 100) / 100))} /min de base${m.lv ? ` × ${fmtX(m.speed)} (niveau ${m.lv})` : ""} × ${fmtX(m.clock)} (cadence)` : ""}><span class="kicker">Au maximum</span>
            {#each r.inputs as [it, n]}<span class="pm"><Item id={it} size={14} />−{fmt1((fmax * n) / r.output[1])}</span>{/each}
            <span class="arrow">▸</span>
            <span class="pm good"><Item id={r.output[0]} size={14} />+{fmt1(fmax)}</span><span class="dim"> /min</span>
          </div>
        {/if}
      {:else if bdef.cls === BClass.Factory}
        <div class="units">
          {#each factoryUnits as { u, i }, slot}
            {@const ok = hasTechUI(u.tech)}
            {@const q = info.queue.find((e: [number, number]) => e[0] === i)}
            {@const hk = keyOf(`factory${slot + 1}`)}
            <div class="tip">
              <button class="ub" class:locked={!ok} disabled={!ok} onclick={(e) => client.queueUnit(i, e.shiftKey ? 5 : 1)} oncontextmenu={(e) => { e.preventDefault(); client.queueUnit(i, e.shiftKey ? -5 : -1); }}>
                {#if sprite("units", u.key)}<img src={sprite("units", u.key)} alt="" />{:else}<span class="ab">{abbrev(u.name)}</span>{/if}
                {#if q}<span class="qn num">{q[1]}</span>{/if}
                {#if u.litter}<span class="lit num">×{u.litter}</span>{/if}
                {#if !ok}<span class="lk"><Icon name="lock" size={12} /></span>{/if}
                {#if hk}<span class="hk key">{hk}</span>{/if}
              </button>
              <div class="tt"><b>{u.name}</b><br />{#if UNIT_DESCS[u.key]}<span class="udesc">{UNIT_DESCS[u.key]}</span><br />{/if}{#if !ok}<span class="bad"><Icon name="lock" size={12} /> Recherche : {d.techs[u.tech].name}</span><br />{/if}
                <span class="num">PV {u.hp} · {(u.speed / 10).toFixed(1)} c/s · {u.litter ? `éclosion en ${10 + 2 * u.build} s` : `${u.build} s`}</span><br />{#if UNIT_TRAITS[u.key]}<span class="good">{UNIT_TRAITS[u.key]}</span><br />{/if}
                {#if u.litter}<span class="good">Portée de {u.litter} œufs, pondus aussitôt et sans coût : chaque œuf puise ensuite son prix dans le réseau</span><br /><span class="dim">La portée, en tout :</span> <Cost cost={u.cost.map(([it, n]): [number, number] => [it, n * u.litter])} />{:else}<Cost cost={u.cost} have={(bdef.race ?? 0) === 0 ? info.reach : undefined} />{/if}</div>
            </div>
          {/each}
        </div>
        <div class="row">
          <label class="rep"><input type="checkbox" checked={info.repeat} onchange={(e) => client.toggleRepeat((e.target as HTMLInputElement).checked)} /> <Icon name="repeat" size={14} /> Répéter</label>
          {#if !info.queue.length}<span class="dim small">File vide</span>{/if}
        </div>
        {#if info.queue.length}
          {@const cur = d.units[info.queue[0][0]]}
          <div class="row"><span class="kicker">En cours · {cur.name}{cur.litter ? ` (portée de ${cur.litter})` : ""}</span>{#if !cur.litter}{#each cur.cost as [it, n]}<Item id={it} n={info.stash[it] ?? 0} need={n} size={16} />{/each}{/if}</div>
        {/if}
        {#if (info.missing ?? []).length}
          <div class="row wrap"><span class="kicker">Manque</span>{#each info.missing as [it, n, near]}<span class="miss"><Item id={it} n={n} size={16} /><span class="small num" class:bad={near < n} class:dim={near >= n}>{near} à portée</span></span>{/each}</div>
        {/if}
        {#if (bdef.race ?? 0) === 1}
          <span class="dim small"><Icon name="logistics" size={12} />
            {#if bdef.key === "brood"}Elle pond ses œufs aussitôt, sans rien payer (trois portées à couver au plus). Chaque œuf puise son prix dans le réseau de son terreau, petit à petit, jusqu'à éclore ; sans sève ou sans sels, il attend. L'ennemi peut le détruire avant.{:else}Elle prend le coût de chaque unité dans la réserve de son réseau.{/if}</span>
        {:else}
          <span class="dim small"><Icon name="logistics" size={12} />
            Ses {d.depot?.factoryDrones ?? 4} drones ({info.drones ?? 0} en vol) vont chercher les composants dans vos dépôts à moins de {d.depot?.factorySupply ?? 30} cases. Elle garde d'avance les composants de 2 unités.</span>
        {/if}
        <span class="dim small"><Icon name="rally" size={12} /> Clic droit sur le terrain : point de ralliement.</span>
      {:else if bdef.cls === BClass.Lab}
        <div class="row"><span class="kicker">Recherche</span> {ui.research ? d.techs[ui.research].name : "aucune"} <button class="icon-btn" onclick={() => (ui.showResearch = true)}><Icon name="research" size={14} /> Choisir {#if keyOf("research")}<span class="key">{keyOf("research")}</span>{/if}</button></div>
        {#if (bdef.race ?? 0) === 0}<div class="row">{#each [0, 1, 2, 3, 4, 5] as k}<Item id={PACK1 + k} n={info.inv[k]} size={20} />{/each}</div>{/if}
      {:else if bdef.cls === BClass.Silo}
        <div class="row">Missiles prêts : <b class="num">{info.ammo}</b> <button class="icon-btn primary" disabled={!info.ammo} onclick={() => client.setMode("launch")}><Icon name="target" size={14} /> Lancer</button></div>
        <div class="row"><span class="kicker">Composants</span>{#each d.missileCost as [it, n], j}<Item id={it} n={info.inv[j]} need={n} size={16} />{/each}</div>
      {:else if bdef.cls === BClass.AntiMissile}
        <div class="row">Intercepteurs : <b class="num">{info.ammo}/3</b></div>
        <div class="row"><span class="kicker">Composants</span>{#each d.interceptorCost as [it, n], j}<Item id={it} n={info.inv[j]} need={n} size={16} />{/each}</div>
      {:else if bdef.cls === BClass.Orbital}
        <div class="row">Charge : <b class="num">{Math.floor((info.charge / (60 * 20 * 1024)) * 100)} %</b> <button class="icon-btn primary" disabled={info.charge < 60 * 20 * 1024} onclick={() => client.setMode("fire")}><Icon name="target" size={14} /> Tirer</button></div>
      {:else if bdef.cls === BClass.Transfer}
        <div class="row"><button class="icon-btn" disabled={info.cooldown > 0} onclick={() => client.setMode("transfer")}><Icon name="teleport" size={14} /> Transférer les unités proches</button>{#if info.cooldown > 0}<span class="dim num">{Math.ceil(info.cooldown / 20)} s</span>{/if}</div>
      {:else if bdef.key === "burrow"}
        <!-- terrier de la Souche : sa sortie est un autre terrier du même réseau -->
        <div class="row"><button class="icon-btn" onclick={() => client.setMode("link")} title="Puis cliquez sur un autre de vos terriers, sur le même réseau de racines"><Icon name="link" size={14} /> Choisir la sortie</button></div>
        <div class="status {info.working ? 'good' : info.link >= 0 ? 'warn' : 'idle'}"><span class="led"></span>{info.working ? "Ouvert : clic droit dessus pour y envoyer des organismes" : info.link >= 0 ? "Fermé : sa sortie n'est plus sur le même réseau de racines" : "Sans sortie"}</div>
      {:else if bdef.cls === BClass.Gate}
        <div class="row"><button class="icon-btn" onclick={() => client.setMode("link")}><Icon name="link" size={14} /> Relier à une autre porte</button><button onclick={() => client.toggleBuilding()}>{info.enabled ? "Fermer" : "Ouvrir"}</button></div>
        <span class="dim small">{info.link >= 0 ? (info.working ? "Ouverte" : "Ouverture… (forte consommation)") : "Non reliée"}</span>
      {:else if bdef.cls === BClass.Shield}
        <div class="row">Bouclier : <b class="num">{info.shield}</b> <button onclick={() => client.toggleBuilding()}>{info.enabled ? "Couper" : "Activer"}</button></div>
      {:else if bdef.cls === BClass.Inserter}
        <div class="row turn">
          <span class="kicker">Rotation</span>
          {#each [[1, "¼ tour", "prend à sa droite"], [2, "½ tour", "prend derrière"], [3, "¾ tour", "prend à sa gauche"]] as [k, label, hint]}
            <button class="icon-btn" class:on={(info.turn ?? 2) === k} disabled={!mine} title={`${label} : ${hint}, dépose devant`} onclick={() => client.setTurn(k as number)}>{label}</button>
          {/each}
        </div>
        <span class="dim small">Le bras dépose toujours devant lui ; il {(info.turn ?? 2) === 1 ? "prend à sa droite" : (info.turn ?? 2) === 3 ? "prend à sa gauche" : "prend derrière lui"}.</span>
        <div class="share">
          <div class="row">
            <span class="kicker">Part de la sortie</span>
            <b class="num">{info.share ? info.share + " %" : "Auto"}</b>
            {#if info.takers > 1}<span class="dim small">effective : <span class="num">{(info.shareEff / 10).toFixed(1)} %</span> · {info.takers} sorties sur cette source (bras et tapis)</span>{/if}
          </div>
          <input type="range" min="0" max="100" step="5" value={info.share} title="0 : automatique (part égale du reste)" onchange={(e) => client.setShare(Number((e.target as HTMLInputElement).value))} />
          <span class="dim small">Les bras qui se servent au même bâtiment alternent. En automatique, ils se partagent à égalité ce que les parts réglées laissent.</span>
        </div>
      {:else if bdef.cls === BClass.Extractor}
        {@const levels = d.extractorLevels ?? []}
        {@const lvl = info.level ?? 0}
        <div class="row"><span class="kicker">Extrait</span> <Item id={info.recipe} size={20} /> {d.items[info.recipe]?.name}</div>
        {@const fmax = (info.flowMax ?? 0) / 10}
        {@const fnow = (info.flow ?? 0) / 10}
        {@const pct = fmax > 0 ? Math.min(100, Math.round((fnow / fmax) * 100)) : 0}
        {@const m = machineMults}
        {#if info.build >= 65536}
          <div class="row small" title="Ce qui a vraiment été extrait pendant la dernière minute, rapporté au maximum de l'extracteur"><span class="kicker">Débit</span> <Item id={info.recipe} size={16} /> <b class="num">{fmt1(fnow)}</b> /min sur la dernière minute · <span class="num pct" class:good={pct >= 90} class:warn={pct < 50}>{pct} %</span> <span class="dim">du max</span></div>
          <div class="perfbar"><span style:width={pct + "%"}></span></div>
          <div class="row small" title={m ? `Vitesse${m.lv ? ` × ${fmtX(m.speed)} (niveau ${m.lv})` : ""} × ${fmtX(m.purity)} (pureté) × ${fmtX(m.clock)} (cadence)` : ""}><span class="kicker">Au maximum</span> <span class="pm good"><Item id={info.recipe} size={14} />+{fmt1(fmax)}</span><span class="dim"> /min</span></div>
        {/if}
      {:else if bdef.cls === BClass.Belt && bdef.collect}
        <span class="dim small">Posé sur un tapis : quand la file est bouchée plus loin, ce qui arrive ici part au dépôt le plus proche (à moins de {d.depot?.near ?? 30} cases) qui a de la place, au lieu de bloquer l'amont. Il ne prend rien tant que la file avance.</span>
        <div class="row"><span class="kicker">Surplus mis en dépôt</span> <span class="num">{info.out ?? 0}</span></div>
      {:else if bdef.cls === BClass.Depot}
        {@const dp = d.depot}
        {@const filters = (info.filters ?? []) as number[]}
        {@const stash = (info.stash ?? []) as number[]}
        <span class="dim small">Son stock lui est propre : les drones de vos constructeurs (commandant, ingénieurs, usines) et de vos générateurs viennent y puiser. Un objet plein (<span class="num">{info.storeCap}</span> au plus) est refusé, et le tapis attend.</span>
        <div class="row"><span class="kicker">Stock</span>{#if !stash.some((n) => n > 0)}<span class="dim small">vide</span>{/if}</div>
        <div class="row wrap">{#each stash as n, i}{#if i > 0 && n > 0}<span class="tip"><Item id={i} {n} size={20} /><span class="tt"><b>{d.items[i]?.name}</b><br /><span class="num">{n} / {info.storeCap}</span></span></span>{/if}{/each}</div>
        <div class="row"><span class="kicker">Sorties</span><span class="dim small">{filters.length ? "seulement les objets choisis" : "tous les objets (par défaut)"}, posés à tour de rôle sur les tapis qui partent du dépôt, ou pris par les bras</span></div>
        <div class="row wrap">
          {#each Array(dp?.maxFilters ?? 4) as _, k}
            <select value={filters[k] ?? 0} disabled={!mine || (k > filters.length)} title="Objet sorti du dépôt (aucun filtre : tout sort)" onchange={(e) => {
              const v = Number((e.target as HTMLSelectElement).value);
              const next = filters.slice();
              if (v > 0) next[k] = v; else next.splice(k, 1);
              client.setFilters(next.filter((x) => x > 0));
            }}>
              <option value={0}>{k === 0 ? "— tout —" : "— aucun —"}</option>
              {#each d.items as it, i}{#if i > 0}<option value={i}>{it.name} ({stash[i] ?? 0})</option>{/if}{/each}
            </select>
          {/each}
        </div>
        {#if (info.level ?? 0) === 0}
          <span class="dim small">Amélioré, il gagne un étage et garde jusqu'à {dp?.cap[1] ?? 2000} de chaque objet.</span>
        {/if}
      {:else if bdef.cls === BClass.Warehouse}
        {@const stash = (info.stash ?? []) as number[]}
        <span class="dim small">Un dépôt commun à l'équipe : les drones de chaque allié peuvent y puiser (<span class="num">{info.storeCap}</span> au plus par objet).</span>
        <div class="row"><span class="kicker">Sortie</span>
          <select value={info.recipe === 255 ? 0 : info.recipe} title="Objet qu'un bras peut prendre dans l'entrepôt" onchange={(e) => client.setRecipe(Number((e.target as HTMLSelectElement).value) || RECIPE_NONE)}>
            <option value={0}>— aucune —</option>
            {#each d.items as it, i}{#if i > 0}<option value={i}>{it.name} ({stash[i] ?? 0})</option>{/if}{/each}
          </select></div>
        <div class="row wrap">{#each stash as n, i}{#if i > 0 && n > 0}<Item id={i} {n} size={18} />{/if}{/each}</div>
      {:else if bdef.cls === BClass.Router}
        {#if bdef.key === "splitter"}
          {@const sp = info.split ?? 0}
          <div class="row turn">
            <span class="kicker">Sorties</span>
            {#each [[0, "Gauche, avant et droite"], [1, "Gauche et avant"], [2, "Droite et avant"]] as [m, label]}
              <button class="icon-btn split" class:on={sp === m} disabled={!mine} title={label as string} aria-label={label as string} onclick={() => client.setSplit(m as number)}><SplitIcon mode={m as number} /></button>
            {/each}
          </div>
          <span class="dim small">Répartit les objets à tour de rôle {sp === 1 ? "à gauche et devant" : sp === 2 ? "à droite et devant" : "à gauche, devant et à droite"}. Entrée par l'arrière ; à la pose, R tourne et la molette choisit les sorties.</span>
        {:else if bdef.key === "overflow"}<span class="dim small">Envoie devant ; quand l'avant est bloqué, déborde à gauche puis à droite.</span>
        {:else}
          <span class="dim small">L'objet choisi part à gauche, tout le reste continue devant.</span>
          <div class="row"><span class="kicker">Objet trié</span>
            <select value={info.recipe === 255 ? 0 : info.recipe} onchange={(e) => client.setRecipe(Number((e.target as HTMLSelectElement).value) || RECIPE_NONE)}>
              <option value={0}>— aucun —</option>
              {#each d.items as it, i}{#if i > 0}<option value={i}>{it.name}</option>{/if}{/each}
            </select></div>
        {/if}
      {:else if bdef.cls === BClass.Portal}
        <span class="dim small">Les unités d'un allié qui entrent dans ce portail deviennent les vôtres. Pour donner des troupes à un allié, envoyez-les dans SON portail.</span>
      {:else if bdef.cls === BClass.Roboport}
        {@const flying = (info.carriers ?? []).filter((c: { state: number }) => c.state === 1 || c.state === 3).length}
        <span class="dim small">8 robots apportent depuis le stock (le vôtre puis celui de l'équipe) ce qui manque aux fabricants, usines, laboratoires et silos dans un rayon de 25 cases, et évacuent vers le stock les sorties bloquées.</span>
        <div class="row"><span class="kicker">Robots en vol</span> <b class="num">{flying}</b> / 8</div>
      {:else if bdef.cls === BClass.Relay && info.relayNet}
        {@const [nRel, nSt] = info.relayNet}
        <span class="dim small">Ses drones portent, depuis les dépôts de son réseau, ce qui manque aux chantiers, usines et générateurs à moins de {d.depot?.relayRange ?? 20} cases. Il se relie aux relais à moins de {d.depot?.relayLink ?? 40} cases.</span>
        <div class="row"><span class="kicker">Drones en vol</span> <b class="num">{info.drones ?? 0}</b> / {d.depot?.relayDrones ?? 4}</div>
        <div class="row"><span class="kicker">Réseau</span> <b class="num">{nRel}</b> {nRel > 1 ? "relais reliés" : "relais"} · <b class="num" class:bad={nSt === 0}>{nSt}</b> {nSt > 1 ? "dépôts" : "dépôt"}</div>
        {#if nSt === 0}<span class="bad small">Aucun dépôt dans son réseau : posez un dépôt (ou un autre relais relié à un dépôt) à moins de {d.depot?.relayRange ?? 20} cases.</span>{/if}
      {:else if isStation}
        {@const air = bdef.cls === BClass.CargoPad}
        {@const capa = d.carriers?.[air ? 1 : 0]?.capacity ?? (air ? 25 : 400)}
        {@const step = air ? 1 : 25}
        <span class="dim small">{air ? "Drones : vol direct, rapides, 25 objets par voyage au plus." : "Trains : sur les rails de l'équipe, 400 objets par voyage au plus."} Bras et tapis entrants déposent dans « À envoyer » ; les « Reçus » sortent sur les tapis qui partent de ses faces et par les bras. Une gare alliée peut être la destination.</span>
        <div class="share">
          <div class="row">
            <span class="kicker">Objets par voyage</span>
            <b class="num">{info.lot ? info.lot : "Auto"}</b>
            <span class="dim small">{info.lot ? `il attend d'en avoir ${info.lot} pour partir` : "il part dès qu'il a quelque chose"}</span>
          </div>
          <input type="range" min="0" max={capa} {step} value={info.lot ?? 0} disabled={!mine} title="0 : automatique" onchange={(e) => client.setLot(Number((e.target as HTMLInputElement).value))} />
        </div>
        <div class="row wrap"><span class="kicker">À envoyer</span>{#each stashList(false) as x}<Item id={x.i} n={x.n} size={16} />{:else}<span class="dim small">vide</span>{/each}</div>
        <div class="row wrap"><span class="kicker">Reçus</span>{#each stashList(true) as x}<Item id={x.i} n={x.n} size={16} />{:else}<span class="dim small">vide</span>{/each}</div>
        {#if mine && (stashList(false).length > 0 || stashList(true).length > 0)}
          <div class="row">
            <button class="ghost icon-btn" title="« À envoyer » et « Reçus » retournent à votre stock" onclick={() => client.emptyStash()}><Icon name="unload" size={14} /> {air ? "Vider l'héliport" : "Vider la gare"}</button>
          </div>
        {/if}
        <div class="row wrap"><span class="kicker">{air ? "Drones" : "Trains"}</span>
          {#each info.carriers ?? [] as c}<span class="chip small" title={ui.names[c.owner] ?? ""}>{c.out ? "→" : "←"} {STATE[c.state] ?? ""} · <span class="num">{c.load}</span></span>{:else}<span class="dim small">aucun</span>{/each}</div>
        <div class="row">
          <button class="icon-btn" onclick={() => client.setMode("link")}><Icon name="link" size={14} /> {air ? "Ajouter un drone vers…" : "Ajouter un train vers…"}</button>
          {#if (info.carriers ?? []).some((c: { out: number }) => c.out)}<button class="ghost danger icon-btn" title="Retirer les véhicules partant d'ici" onclick={() => client.removeCarriers()}><Icon name="trash" size={14} /></button>{/if}
        </div>
        {#if d.carriers?.[air ? 1 : 0]}<span class="dim small">Coût d'un {air ? "drone" : "train"} : <Cost cost={d.carriers[air ? 1 : 0].cost} have={info.reach ?? null} /></span>{/if}
      {/if}
      {#if upg && info.build >= 65536}
        <!-- amélioration : le bouton seul ; ce qu'elle apporte et coûte s'affiche au survol, dans une carte -->
        <div class="upgrade">
          {#if info.upgrade > 0}
            <div class="upbar"><span style="width: {info.upgrade / 10}%"></span></div>
            <button class="icon-btn danger" title="Rembourse le coût de l'amélioration" onclick={() => client.upgradeBuilding()}><Icon name="close" size={14} /> Annuler l'amélioration</button>
          {:else}
            {@const ok = hasTechUI(upg.tech)}
            <div class="tip upcard">
              <button class="icon-btn" disabled={!ok || !canPay(info.reach ?? null, upg.cost)} onclick={() => client.upgradeBuilding()}><Icon name={ok ? "plus" : "lock"} size={14} /> {upg.label}</button>
              <div class="tt">
                <b>{upg.label}</b><br />
                {#if upgCur}<span class="dim">Actuellement :</span> {upgCur}<br />{/if}
                <span class="dim">Après :</span> {upg.gain}<br />
                <span class="dim">Chantier :</span> <span class="num">{upg.time}</span> s, {"running" in upg ? "le bâtiment reste en service" : "le bâtiment s'arrête pendant ce temps"}<br />
                {#if ok}<span class="dim">Coût (pris à portée du bâtiment, réseau des relais compris) :</span> <Cost cost={upg.cost} have={info.reach ?? null} />{:else}<span class="bad"><Icon name="lock" size={12} /> Recherche requise : {d.techs[upg.tech]?.name}</span>{/if}
              </div>
            </div>
          {/if}
        </div>
      {/if}
    {/if}
  </div>
{:else if ui.selBuildings.length > 1 && d}
  <!-- plusieurs bâtiments : un aperçu par type, et seulement la démolition -->
  {@const own = ui.selBuildings.filter((b) => b.owner === ui.me)}
  {@const bgroups = groupByKind(ui.selBuildings)}
  <div class="panel sel">
    <div class="uhead">
      <span class="kicker">Sélection</span>
      <b class="title num">{ui.selBuildings.length}</b>
      <span class="dim">bâtiments</span>
    </div>
    <div class="groups">
      {#each bgroups as [kind, list] (kind)}
        <button class="grp tip" onclick={() => client.selectIds(list.map((b) => b.ref))}>
          {#if sprite("buildings", d.buildings[kind].key)}<img src={sprite("buildings", d.buildings[kind].key)} alt="" />{:else}<span class="ab">{abbrev(d.buildings[kind].name)}</span>{/if}
          <span class="cnt num">{list.length}</span>
          <span class="tt"><b>{d.buildings[kind].name}</b><br /><span class="dim">Clic : ne garder que ce type</span></span>
        </button>
      {/each}
    </div>
    {#if ui.groupMods}<Upgrades mi={ui.groupMods.info} refs={ui.groupMods.refs} />{/if}
    {#if pausables.length}
      {@const pl = pausables}
      {@const all = pl.every((b) => b.paused)}
      {@const np = pl.filter((b) => b.paused).length}
      <div class="stline">
        <div class="status {np ? 'paused' : 'idle'}"><span class="led"></span>{np ? `${np} machine${np > 1 ? "s" : ""} sur ${pl.length} en pause` : `${pl.length} machine${pl.length > 1 ? "s" : ""} ou usine${pl.length > 1 ? "s" : ""} de production`}</div>
        <button class="icon-btn pausebtn" class:resume={all} title={all ? "Relancer toutes ces machines : elles reprennent là où elles en étaient" : "Mettre en pause toutes ces machines : plus d'énergie, plus d'ingrédients ni de production ; contenu et cycle en cours gardés"} onclick={() => client.togglePauseSelected()}><Icon name={all ? "play" : "pause"} size={13} /> {all ? "Tout reprendre" : "Tout mettre en pause"} {#if keyOf("pauseBuilding")}<span class="key">{keyOf("pauseBuilding")}</span>{/if}</button>
      </div>
    {/if}
    {#if own.length}
      <div class="row">
        <button class="icon-btn danger" title="Démontés par vos constructeurs, matériaux rapportés à vos dépôts ; les chantiers sont annulés" onclick={() => client.demolishSelected()}><Icon name="reclaim" size={14} /> Démolir {own.length > 1 ? `les ${own.length} bâtiments` : "le bâtiment"} {#if keyOf("cancelBuilding")}<span class="key">{keyOf("cancelBuilding")}</span>{/if}</button>
      </div>
    {/if}
  </div>
{:else if ui.selUnits.length && d && ui.selForeign >= 0}
  <!-- unités d'un autre joueur : statistiques seulement (ni ordres ni commandes) -->
  <div class="panel sel">
    <div class="uhead">
      <span class="kicker" style:color={foreignColor}>{isFauna(ui.selForeign) ? "Faune sauvage" : `${enemyTeam ? "Ennemi" : "Allié"} · ${ui.names[ui.selForeign] ?? ""}`}</span>
      <b class="title num">{total}</b>
      <span class="dim">unité{total > 1 ? "s" : ""}</span>
    </div>
    {#each ui.selUnits as g}
      {@const st = unitStats(g.kind)}
      <div class="stats">
        <div class="sthumb">{#if sprite("units", st.u.key)}<img src={sprite("units", st.u.key)} alt="" />{:else}<span class="ab">{abbrev(st.u.name)}</span>{/if}</div>
        <div class="sbody">
          <b>{st.u.name}</b>{#if g.count > 1} <span class="dim">× <span class="num">{g.count}</span></span>{/if}{#if g.lvl} <span class="vet2">{"◆".repeat(g.lvl)}</span>{/if}
          {#if ui.unitInfo && ui.selUnits.length === 1 && g.count === 1}
            {@const f = ui.unitInfo.hp / Math.max(1, ui.unitInfo.maxHp)}
            <div class="hpline"><span class="hp" class:mid={f < 0.6} class:low={f < 0.3}><span style:width={f * 100 + "%"}></span></span><span class="num small">{ui.unitInfo.hp}/{ui.unitInfo.maxHp}</span></div>
          {/if}
          <div class="sgrid small">
            <span class="dim">PV</span><span class="num">{st.u.hp}</span>
            <span class="dim">Dégâts/s</span><span class="num">{st.dps ? st.dps.toFixed(0) : "—"}</span>
            <span class="dim">Portée</span><span class="num">{st.range ? st.range + " cases" : "—"}</span>
            <span class="dim">Vitesse</span><span class="num">{st.speed ? st.speed.toFixed(1) + " cases/s" : "immobile"}</span>
            <span class="dim">Milieu</span><span>{client.unitLayerName(st.u.layer)}</span>
            <span class="dim">Vision</span><span class="num">{st.u.vision} cases</span>
          </div>
          {#if ui.selUnits.length === 1 && UNIT_DESCS[st.u.key]}<p class="udesc small">{UNIT_DESCS[st.u.key]}</p>{/if}
        </div>
      </div>
    {/each}
  </div>
{:else if ui.selUnits.length && d}
  <div class="panel sel">
    <div class="uhead">
      <span class="kicker">Sélection</span>
      <b class="title num">{total}</b>
      <span class="dim">unité{total > 1 ? "s" : ""}{#if ui.selUnits.length === 1} · {d.units[ui.selUnits[0].kind].name}{/if}</span>
    </div>
    {#if ui.selUnits.length === 1 && UNIT_DESCS[d.units[ui.selUnits[0].kind].key]}<p class="udesc small">{UNIT_DESCS[d.units[ui.selUnits[0].kind].key]}</p>{/if}
    {#if ui.unitInfo && total === 1}
      {@const f = ui.unitInfo.hp / Math.max(1, ui.unitInfo.maxHp)}
      <div class="hpline own"><span class="hp" class:mid={f < 0.6} class:low={f < 0.3}><span style:width={f * 100 + "%"}></span></span><span class="num small">{ui.unitInfo.hp} / {ui.unitInfo.maxHp} PV</span></div>
      {@const tr = UNIT_TRAITS[d.units[ui.selUnits[0].kind].key]}
      {#if tr}<span class="dim small">{tr}</span>{/if}
      {#if ui.unitInfo.cloaked}<span class="good small">Camouflé : invisible pour l'ennemi</span>{:else if d.units[ui.selUnits[0].kind].key === "commando"}<span class="bad small">Repérable : il vient de tirer</span>{/if}
      {#if ui.unitInfo.radarStealth && !ui.unitInfo.cloaked}<span class="good small">Absent des radars ennemis</span>{/if}
      {#if queen && (ui.unitInfo.tame ?? -1) >= 0}
        <div class="tamebar"><span style="width: {(ui.unitInfo.tame ?? 0) / 10}%"></span></div>
        <div class="row small"><span class="kicker">Apprivoisement</span> <span class="num">{(ui.unitInfo.tame ?? 0) > 0 ? `${Math.floor((ui.unitInfo.tame ?? 0) / 10)} % · ${Math.ceil(((1000 - (ui.unitInfo.tame ?? 0)) * 30) / 1000)} s` : "en approche"}</span></div>
      {/if}
      {#if queen && (ui.unitInfo.pack === 3 || ui.unitInfo.pack === 4)}
        <div class="row small"><span class="kicker">{ui.unitInfo.pack === 3 ? "S'enracine" : "Se déracine"}</span> <span class="num">{Math.ceil((ui.unitInfo.packLeft ?? 0) / 20)} s</span></div>
        <div class="upbar"><span style="width: {100 - ((ui.unitInfo.packLeft ?? 0) / 60) * 100}%"></span></div>
      {:else if rooted}
        <div class="status {ui.unitInfo.soil ? 'good' : 'warn'}"><span class="led"></span>{ui.unitInfo.soil ? "Enracinée : +5 sève/s à son réseau, organes et couveuses plus rapides, −40 % de dégâts subis, +50 % infligés" : "Enracinée hors de tout terreau : elle ne nourrit aucun réseau"}</div>
      {:else if queen}
        <span class="dim small">{ui.unitInfo.soil ? "Sur votre terreau : elle peut s'y enraciner" : "Hors du terreau : elle ne peut pas s'enraciner ici"}</span>
      {/if}
      {#if ui.unitInfo.pack && !queen}
        <!-- chenillard des Transhumants : déploiement (15 s) ou repli (10 s) en cours -->
        {@const total = d.units[ui.selUnits[0].kind].turret ? (ui.unitInfo.pack === 1 ? 40 : 30) : ui.unitInfo.pack === 1 ? 300 : 200}
        <div class="row small"><span class="kicker">{ui.unitInfo.pack === 1 ? "Déploiement" : "Repli"}</span> <span class="num">{Math.ceil((ui.unitInfo.packLeft ?? 0) / 20)} s</span>{#if ui.unitInfo.pack === 1}<span class="dim"> · un ordre de déplacement l'annule</span>{/if}</div>
        <div class="upbar"><span style="width: {100 - ((ui.unitInfo.packLeft ?? 0) / total) * 100}%"></span></div>
      {/if}
      <!-- l'Arche a son propre panneau (Game.svelte) -->
      {#if ui.unitInfo.mods && !ui.unitInfo.mods.ark && ui.me >= 0}<Upgrades mi={ui.unitInfo.mods} refs={ui.selUnits[0].ids} />{/if}
      {#if ui.unitInfo.egg}
        <!-- œuf de la Souche : l'organisme qu'il porte, et le temps avant l'éclosion -->
        {@const eg = ui.unitInfo.egg}
        <div class="row small"><span class="kicker">Éclosion</span> <b>{d.units[eg.kind]?.name}</b> <span class="num">dans {Math.ceil(eg.left / 20)} s</span></div>
        {#if eg.paid?.length}<div class="row small"><span class="kicker">Puisé</span> {#each eg.paid as [it, got, n]}<Item id={it} n={got} need={n} size={16} />{/each}</div>{/if}
        {#if eg.wait}<div class="status warn"><span class="led"></span>En attente : pas de sève ou de sels à puiser dans le réseau</div>{/if}
        <div class="upbar"><span style="width: {100 - (eg.left / Math.max(1, eg.total)) * 100}%"></span></div>
      {/if}
      {#if ui.unitInfo.harvest}
        <!-- récolte du commandant : gisement -> fonderie intégrée -> stock -->
        {@const h = ui.unitInfo.harvest}
        <div class="harvest">
          <div class="flow">
            <Item id={h.raw} size={22} /><span class="arrow">›››</span><Icon name="harvest" size={16} /><span class="arrow">›››</span><Item id={h.out} size={22} />
            <span class="small">{d.items[h.out]?.name} · <span class="num">{(h.cycle / 20).toFixed(0)} s</span> par unité</span>
          </div>
          {#if h.state === 1}
            <div class="status good"><span class="led"></span>Récolte et fonte en cours · gisement {h.x}, {h.y}</div>
            <div class="upbar"><span style:width={h.progress / 10 + "%"}></span></div>
          {:else if h.state === 0}
            <div class="status build"><span class="led"></span>En route vers le gisement ({h.x}, {h.y})</div>
          {:else if h.state === 2}
            <div class="status warn"><span class="led"></span>Interrompue : le commandant combat</div>
          {:else}
            <div class="status warn"><span class="led"></span>En attente : soute pleine (aucun dépôt à portée pour la vider)</div>
          {/if}
        </div>
      {/if}
      {#if ui.unitInfo.pickup}
        <!-- ramassage de la sortie d'un extracteur ou d'un fabricant (ordre Pickup) -->
        {@const p = ui.unitInfo.pickup}
        {@const bname = d.buildings[p.kind]?.name ?? "bâtiment"}
        <div class="harvest">
          <div class="flow">
            <span class="small">{bname}</span><span class="arrow">›››</span>{#if p.item}<Item id={p.item} n={p.out} size={20} />{:else}<span class="dim small">rien</span>{/if}<span class="arrow">›››</span><span class="small">soute</span>
          </div>
          {#if p.state === 0}
            <div class="status build"><span class="led"></span>En route vers {bname.toLowerCase()} ({p.x}, {p.y})</div>
          {:else if p.state === 1}
            <div class="status good"><span class="led"></span>Ramasse ce qui sort, à mesure</div>
          {:else if p.state === 2}
            <div class="status warn"><span class="led"></span>Soute pleine : ses drones la vident dans un dépôt</div>
          {:else if d.units[ui.selUnits[0].kind].commander}
            <div class="status warn"><span class="led"></span>Soute pleine pour ce produit : cliquez-le dans la soute pour le livrer à un dépôt</div>
          {:else}
            <div class="status warn"><span class="led"></span>Soute pleine : aucun de vos dépôts n'a de place</div>
          {/if}
        </div>
      {/if}
      {#if ui.unitInfo.deliver}
        {@const dv = ui.unitInfo.deliver}
        <div class="status build"><span class="led"></span>Livre {dv.item ? (d.items[dv.item]?.name.toLowerCase() ?? "un objet") : "sa soute"}{dv.x >= 0 ? ` au dépôt (${dv.x}, ${dv.y})` : ""}</div>
      {/if}
      {@const ud = d.units[ui.selUnits[0].kind]}
      {#if ud.drones > 0 && ui.unitInfo.hold}
        <!-- constructeur : soute, drones, ce qui est à portée (voir drones.rs) -->
        {@const hold = ui.unitInfo.hold as number[]}
        {@const reach = (ui.unitInfo.reach ?? []) as number[]}
        {@const inHold = hold.reduce((a: number, b: number) => a + b, 0)}
        <div class="row">{#if ud.commander}<span class="kicker tip">Soute (dépôt)<span class="tt">Elle compte comme un dépôt : les drones des ingénieurs et des usines proches y puisent, et la récolte y reste</span></span><span class="num small">{inHold}</span><span class="dim small">· {ui.unitInfo.mods?.ark?.cap ?? d.depot?.cap[0] ?? 600} par objet</span>{:else}<span class="kicker">Soute</span><span class="num small">{inHold} / {ud.hold}</span>{/if}<span class="dim small">· drones en vol <span class="num">{ui.unitInfo.drones ?? 0} / {ud.drones}</span></span></div>
        {#if inHold > 0}
          <!-- clic sur un objet : le porter au dépôt le plus proche qui a de la place (ordre Deliver) -->
          <div class="row wrap">
            {#each hold as n, i}{#if i > 0 && n > 0}<button class="hitem" title="Livrer : {d.items[i]?.name} au dépôt le plus proche (Maj : en file)" onclick={(ev) => client.deliverSelected(i, ev.shiftKey)}><Item id={i} {n} size={18} /></button>{/if}{/each}
            <button class="icon-btn hall" title="Porter toute la soute au dépôt le plus proche qui a de la place (Maj : en file)" onclick={(ev) => client.deliverSelected(0, ev.shiftKey)}>Tout livrer</button>
          </div>
          <span class="dim tiny">Clic sur un objet : le porter au dépôt le plus proche</span>
        {/if}
        {#if ui.unitInfo.loading}<div class="status build"><span class="led"></span>Charge sa soute : les environs du chantier n'ont pas tout</div>{/if}
        <div class="row"><span class="kicker">À portée ({ud.supply} cases)</span>{#if !reach.some((n) => n > 0)}<span class="dim small">aucun dépôt garni</span>{/if}</div>
        {#if reach.some((n) => n > 0)}<div class="row wrap">{#each reach as n, i}{#if i > 0 && n > 0}<Item id={i} {n} size={16} />{/if}{/each}</div>{/if}
      {/if}
    {/if}
    {#if ui.groupMods && total > 1}<Upgrades mi={ui.groupMods.info} refs={ui.groupMods.refs} />{/if}
    <div class="groups">
      {#each ui.selUnits as g}
        <button class="grp tip" onclick={() => client.selectIds(g.ids)}>
          {#if sprite("units", d.units[g.kind].key)}<img src={sprite("units", d.units[g.kind].key)} alt="" />{:else}<span class="ab">{abbrev(d.units[g.kind].name)}</span>{/if}
          <span class="cnt num">{g.count}</span>
          {#if g.lvl}<span class="vet">{"◆".repeat(g.lvl)}</span>{/if}
          <span class="tt"><b>{d.units[g.kind].name}</b><br /><span class="num">PV {d.units[g.kind].hp}</span> · {client.unitLayerName(d.units[g.kind].layer)}{#if g.lvl}<br /><span class="good">Vétérance {g.lvl} : +{g.lvl * 10} % de points de vie, +{g.lvl * 5} % de dégâts</span>{/if}<br /><span class="dim">Clic : ne garder que ce type</span></span>
        </button>
      {/each}
    </div>
    <!-- des œufs de la Souche ou des tourelles d'Arche seuls : ils ne reçoivent pas d'ordres -->
    {#if ui.me >= 0 && ui.selUnits.every((g) => d.units[g.kind].turret)}<span class="dim small">Dirigées par l'Arche : sélectionnez-la pour les rappeler ou changer leur type.</span>{/if}
    {#if ui.me >= 0 && !ui.selUnits.every((g) => d.units[g.kind].egg || d.units[g.kind].turret)}
      <div class="cmds">
        <button class="cmd" onclick={() => client.stopSelected()} title="Arrêt"><Icon name="stop" size={17} /><span class="key">{keyOf("stop")}</span></button>
        <button class="cmd" onclick={() => client.setMode("attackMove")} title="Attaque en mouvement"><Icon name="attack" size={17} /><span class="key">{keyOf("attackMove")}</span></button>
        <button class="cmd" onclick={() => client.setMode("patrol")} title="Patrouille"><Icon name="patrol" size={17} /><span class="key">{keyOf("patrol")}</span></button>
        <button class="cmd" onclick={() => client.setMode("assist")} title="Escorter / assister"><Icon name="assist" size={17} /><span class="key">{keyOf("assist")}</span></button>
        <button class="cmd" onclick={() => client.setMode("attackGround")} title="Tir au sol"><Icon name="ground" size={17} /></button>
        {#if anyEng}<button class="cmd" onclick={() => client.setMode("reclaim")} title="Recycler"><Icon name="reclaim" size={17} /><span class="key">{keyOf("reclaim")}</span></button>{/if}
        {#if deployable}<button class="cmd" class:on={rooted} onclick={() => client.deploySelected()} title={queen ? (rooted ? "Déraciner la Reine (3 s)" : "Enraciner la Reine sur votre terreau (3 s) : elle nourrit son réseau, résiste et frappe mieux, mais ne bouge plus") : chenillards ? "Déployer : choisissez l'emplacement et le sens du module (R pour tourner), puis cliquez" : "Déployer"}><Icon name="deploy" size={17} /><span class="key">{keyOf("deploy")}</span></button>{/if}
        {#if anyCarrier}<button class="cmd" onclick={() => client.setMode("unload")} title="Décharger"><Icon name="unload" size={17} /><span class="key">{keyOf("unload")}</span></button>{/if}
        {#if queen}
          {@const dens = client.denLimit()}
          <button class="cmd" class:off={dens.have >= dens.max} onclick={() => client.tameMode()} title="Apprivoiser un nid de mordeurs ({dens.have} / {dens.max} nids greffés, un de plus par mutation acquise) : la Reine s'y tient 30 s à moins de 6 cases, sans frapper le nid ni ses bêtes ; il devient le vôtre avec sa horde (aussi : clic droit sur le nid)"><Icon name="tame" size={17} /><span class="key">{keyOf("tame")}</span></button>
        {/if}
        {#if anyFerry}<button class="cmd" onclick={() => client.setMode("ferryFrom")} title="Navette : le transport fait des allers-retours entre deux points, il embarque les unités de combat qui attendent au premier et les dépose au second"><Icon name="ferry" size={17} /><span class="key">{keyOf("ferry")}</span></button>{/if}
        {#if has("commander")}<button class="cmd" onclick={() => client.setMode("harvest")} title="Récolter un gisement : le commandant extrait le minerai et le fond dans sa fonderie intégrée (aussi : clic droit sur un gisement libre)"><Icon name="harvest" size={17} /><span class="key">{keyOf("harvest")}</span></button>{/if}
        {#if has("commander") && hasTechUI(35)}<button class="cmd" onclick={() => client.setMode("teleport")} title="Téléportation"><Icon name="teleport" size={17} /></button>{/if}
        {#if has("hyper_cruiser")}<button class="cmd" onclick={() => client.setMode("jump")} title="Saut hyperespace"><Icon name="jump" size={17} /></button>{/if}
      </div>
    {/if}
    {#if anyEng}<span class="dim small">{ui.race === 2 ? "" : "Choisissez un bâtiment à droite. "}Clic droit sur une épave : recycler.</span>{/if}
  </div>
{:else if ui.selPlan && d}
  <!-- construction prévue (fantôme) : on peut l'annuler -->
  {@const pd = d.buildings[ui.selPlan.kind]}
  <div class="panel sel">
    <div class="head" style:--pc="#58d8ff">
      <div class="thumb">{#if sprite("buildings", pd.key)}<img src={sprite("buildings", pd.key)} alt="" />{/if}</div>
      <div class="ht">
        <div class="kicker">Construction prévue</div>
        <b class="title">{pd.name}</b>
        <span class="dim small">Pas encore commencée · case {ui.selPlan.x}, {ui.selPlan.y}</span>
      </div>
    </div>
    <button class="icon-btn danger" title="Retire ce bâtiment des constructions prévues (rien n'est dépensé)" onclick={() => client.cancelPlan()}><Icon name="close" size={14} /> Annuler {#if keyOf("cancelBuilding")}<span class="key">{keyOf("cancelBuilding")}</span>{/if}</button>
  </div>
{:else if dep && d}
  <!-- gisement : ce qu'il contient, s'il est exploité -->
  <div class="panel sel">
    <div class="head" style:--pc="#3ef0ff">
      <div class="thumb">{#if dep.kind === GEYSER}<svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true"><ellipse cx="22" cy="36" rx="14" ry="4" fill="#5d5046" /><path d="M16 34c-4-8 4-10 0-18m6 18c-3-9 5-12 1-24m6 24c-4-8 4-10 0-18" stroke="#e8f0f4" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.85" /></svg>{:else}<Item id={dep.kind} size={44} />{/if}</div>
      <div class="ht">
        <div class="kicker">{dep.kind === GEYSER ? "Source de vapeur" : "Gisement"}</div>
        <b class="title">{dep.kind === GEYSER ? "Geyser" : (d.items[dep.kind]?.name ?? "?")}</b>
        <span class="dim small">Inépuisable · case {dep.x}, {dep.y}</span>
      </div>
    </div>
    <div class="row"><span class="kicker">Pureté</span> <b class="purity p{dep.purity}">{dep.purity >= 200 ? "Pur" : dep.purity <= 50 ? "Impur" : "Normal"}</b><span class="dim small num">· rendement ×{(dep.purity / 100).toLocaleString("fr-FR")}</span></div>
    {#if depUser}
      <div class="status {depUser.owner === ui.me ? 'good' : 'warn'}"><span class="led"></span>Exploité par {depUser.owner === ui.me ? "vous" : (ui.names[depUser.owner] ?? "un autre joueur")} ({d.buildings[depUser.kind]?.name})</div>
    {:else}
      <div class="status idle"><span class="led"></span>Libre : posez {dep.kind === GEYSER ? "une centrale géothermique" : "un extracteur"} dessus pour l'exploiter</div>
      {#if client.harvestRecipe(dep.kind) >= 0}<span class="dim small">Ou récoltez-le avec votre commandant (clic droit dessus), plus lentement : il fond le minerai lui-même.</span>{/if}
    {/if}
  </div>
{/if}

<style>
  /* pas de défilement : les infobulles doivent pouvoir sortir du panneau */
  .sel { padding: 11px 13px; min-width: 280px; max-width: 520px; display: flex; flex-direction: column; gap: 8px; }
  .adapt { display: flex; flex-direction: column; gap: 3px; }
  .adapt .fam { justify-content: space-between; min-height: 22px; }
  .head { display: flex; gap: 11px; align-items: center; }
  .thumb { width: 56px; height: 56px; flex-shrink: 0; display: grid; place-items: center; background: radial-gradient(circle at 50% 60%, color-mix(in srgb, var(--pc) 30%, transparent), transparent 70%); border: 1px solid var(--line); }
  .thumb img { width: 52px; height: 52px; object-fit: contain; }
  .ht { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
  .title { font-size: 15px; font-weight: 600; letter-spacing: 0.04em; }
  .hpline { display: flex; align-items: center; gap: 8px; }
  .hpline.own { margin: 4px 0 6px; }
  .hpline .hp { flex: 1; display: block; }
  .hpline .hp > span { display: block; height: 100%; background: linear-gradient(90deg, var(--good), #a8ffd8); box-shadow: 0 0 6px rgba(77, 255, 176, 0.5); }
  .hpline .hp.mid > span { background: linear-gradient(90deg, var(--amber), #ffd28a); }
  .hpline .hp.low > span { background: linear-gradient(90deg, var(--bad), #ff8a95); }
  .status { display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--dim); }
  .led { width: 7px; height: 7px; background: var(--dim); }
  .status.good { color: var(--good); }
  .status.good .led { background: var(--good); box-shadow: 0 0 8px var(--good); }
  .status.warn { color: var(--warn); }
  .vet { position: absolute; top: 1px; left: 3px; font-size: 8px; color: #ffd060; letter-spacing: -1px; text-shadow: 0 0 4px rgba(255, 200, 80, 0.8); }
  .status.warn .led { background: var(--warn); box-shadow: 0 0 8px var(--warn); animation: blink 1s infinite; }
  .status.build { color: var(--accent); }
  .status.build .led { background: var(--accent); box-shadow: 0 0 8px var(--accent); }
  .status.paused { color: #9fc6ff; }
  .status.paused .led { background: #9fc6ff; box-shadow: 0 0 8px #9fc6ff; }
  .stline { display: flex; align-items: center; gap: 8px; }
  .stline .status { flex: 1; min-width: 0; }
  .pausebtn { flex-shrink: 0; font-size: 11px; padding: 3px 8px; white-space: nowrap; }
  .pausebtn.resume { color: #9fc6ff; --b-line: rgba(159, 198, 255, 0.6); }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .upgrade { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
  .upbar { height: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.08); overflow: hidden; }
  .upbar span { display: block; height: 100%; background: #f5b342; }
  .rlock { margin-top: 6px; font-size: 11px; opacity: 0.75; }
  .rhead { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .rhead .icon-btn { font-size: 11px; padding: 3px 8px; }
  .share { display: flex; flex-direction: column; gap: 6px; }
  .stats { display: flex; gap: 10px; align-items: flex-start; padding: 6px 0; border-top: 1px solid var(--line); }
  .sthumb { width: 46px; height: 46px; flex-shrink: 0; display: grid; place-items: center; border: 1px solid var(--line); }
  .sthumb img { width: 42px; height: 42px; object-fit: contain; }
  .sbody { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
  .sgrid { display: grid; grid-template-columns: auto 1fr auto 1fr; gap: 2px 10px; }
  .sgrid.nest { margin: 6px 0 4px; }
  .vet2 { font-size: 9px; color: #ffd060; }
  .share input[type="range"] { width: 100%; }
  .harvest { display: flex; flex-direction: column; gap: 5px; }
  .hitem { display: inline-flex; align-items: center; padding: 2px 5px; border: 1px solid var(--line); background: rgba(255, 255, 255, 0.03); cursor: pointer; }
  .hitem:hover { border-color: var(--accent); background: rgba(62, 240, 255, 0.08); }
  .hall { font-size: 11px; padding: 3px 8px; }
  .miss { display: inline-flex; align-items: center; gap: 3px; margin-right: 6px; }
  .flow { display: flex; gap: 8px; align-items: center; padding: 6px 8px; background: rgba(62, 240, 255, 0.04); border: 1px solid var(--line); }
  .arrow { color: var(--accent); letter-spacing: -2px; }
  .recipes { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 4px; max-height: 236px; overflow-y: auto; padding-right: 2px; }
  .recipes > .tip { display: block; }
  .rc { position: relative; width: 100%; height: 100%; min-height: 70px; display: flex; flex-direction: column; align-items: stretch; gap: 3px; padding: 5px 6px; text-align: left; }
  .rc.none { justify-content: center; align-items: center; text-align: center; }
  .rc.on { border-color: var(--accent); background: rgba(62, 240, 255, 0.12); box-shadow: inset 0 0 0 1px var(--accent); }
  .rc.locked { opacity: 0.45; }
  .rc .lk { position: absolute; right: 4px; top: 3px; color: var(--amber); }
  .rflow { display: flex; align-items: center; gap: 4px; }
  .rin { display: flex; flex-wrap: wrap; gap: 2px; }
  .rflow .arrow { font-size: 11px; }
  .rname { font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rmeta { display: flex; gap: 8px; font-size: 10.5px; color: var(--dim); }
  .rmeta > span { display: inline-flex; align-items: center; gap: 2px; }
  .tiny { font-size: 10px; }
  .detail { display: flex; flex-direction: column; gap: 3px; padding: 6px 8px; border: 1px solid var(--line); }
  .pm { display: inline-flex; align-items: center; gap: 2px; margin-right: 8px; color: var(--warn); }
  .pm.good { color: var(--good); }
  .pct.good { color: var(--good); }
  .udesc { display: block; margin: 4px 0; line-height: 1.4; color: color-mix(in srgb, var(--text, #dfe8ee) 82%, transparent); max-width: 340px; }
  p.udesc { margin: 2px 0 6px; }
  .pct.warn { color: var(--warn); }
  .units { display: grid; grid-template-columns: repeat(auto-fill, 52px); gap: 4px; }
  .ub { position: relative; width: 52px; height: 52px; padding: 2px; display: grid; place-items: center; }
  .ub img { width: 44px; height: 44px; object-fit: contain; }
  .ub.locked img { filter: grayscale(1) brightness(0.5); }
  .qn { position: absolute; right: 3px; bottom: 2px; font-size: 11px; color: var(--accent-ink); background: var(--accent); padding: 0 3px; font-weight: 600; }
  .lk { position: absolute; left: 3px; top: 3px; color: var(--amber); }
  .lit { position: absolute; left: 3px; bottom: 2px; font-size: 10px; line-height: 12px; padding: 0 3px; color: var(--amber); background: rgba(4, 7, 12, 0.75); font-weight: 600; }
  .ub .hk { position: absolute; right: 2px; top: 2px; font-size: 8.5px; line-height: 11px; padding: 0 2px; background: rgba(4, 7, 12, 0.7); }
  .rep { display: inline-flex; align-items: center; gap: 6px; }
  .uhead { display: flex; align-items: baseline; gap: 8px; }
  .uhead .title { font-size: 20px; color: var(--accent); }
  .groups { display: flex; flex-wrap: wrap; gap: 4px; }
  .grp { position: relative; width: 50px; height: 50px; padding: 2px; display: grid; place-items: center; }
  .grp img { width: 42px; height: 42px; object-fit: contain; }
  .ab { font-weight: 700; font-size: 12px; }
  .cnt { position: absolute; right: 3px; bottom: 1px; font-size: 11px; color: #fff; text-shadow: 0 0 4px #000, 0 0 2px #000; }
  .cmds { display: flex; flex-wrap: wrap; gap: 4px; }
  .cmd { position: relative; width: 40px; height: 36px; display: grid; place-items: center; padding: 0; color: var(--accent); }
  .cmd:hover:not(:disabled) { color: #fff; }
  .tamebar { height: 7px; background: rgba(217, 92, 255, 0.14); border: 1px solid rgba(217, 92, 255, 0.35); }
  .tamebar > span { display: block; height: 100%; background: linear-gradient(90deg, #8e3cff, #e07cff); box-shadow: 0 0 6px rgba(217, 92, 255, 0.6); transition: width 0.3s linear; }
  .cmd.off { opacity: 0.45; }
  .cmd.on { color: var(--accent-ink, #04121a); }
  .cmd .key { position: absolute; right: 2px; top: 1px; font-size: 8.5px; border: none; padding: 0; opacity: 0.7; }
  .sel :global(.key:empty) { display: none; }
  @keyframes blink { 50% { opacity: 0.3; } }
  .turn .icon-btn { padding: 3px 9px; }
  .turn .icon-btn.on { color: var(--accent); border-color: var(--accent); background: rgba(62, 240, 255, 0.12); }
  .fuelbar { display: inline-block; width: 70px; height: 6px; background: rgba(255, 255, 255, 0.08); margin: 0 4px; vertical-align: middle; }
  .fuelbar > span { display: block; height: 100%; background: var(--amber); }
  .belt { display: flex; flex-direction: column; gap: 4px; }
  .lane { display: inline-flex; gap: 2px; align-items: center; padding: 2px 4px; background: rgba(62, 240, 255, 0.04); border: 1px solid var(--line); }
  .bslot { display: inline-flex; width: 22px; height: 22px; align-items: center; justify-content: center; border: 1px dashed rgba(255, 255, 255, 0.12); }
  .bslot.full { border-style: solid; border-color: rgba(62, 240, 255, 0.25); }
  .lane .arrow { margin-left: 2px; }
  .fuelbar.empty { outline: 1px solid var(--bad, #ff5a4f); }
  .nowrap { white-space: nowrap; }
  .turn .icon-btn.split { padding: 2px 6px; }
  .purity.p50 { color: #e08a5a; }
  .purity.p100 { color: var(--text, #d8e2ea); }
  .purity.p200 { color: #7fe08a; }
  .perfbar { height: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.08); overflow: hidden; margin: -2px 0 4px; }
  .perfbar span { display: block; height: 100%; background: var(--accent, #3ef0ff); }
  .upcard .tt { min-width: 240px; }
</style>
