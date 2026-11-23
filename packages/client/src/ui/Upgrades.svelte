<script lang="ts">
  // Améliorations des Transhumants (Arche, modules, unités) : emplacements, choix, installation en cours ; pour
  // l'Arche, tourelles, surcharge, bouclier et atelier embarqué. Règles : sim/src/ameliorations.rs.
  import { ui, hasTechUI } from "../game/state.svelte.ts";
  import { client } from "../game/client.ts";
  import { canPay } from "../game/reach.ts";
  import { factoryUnitKinds } from "../game/catalog.ts";
  import { UNIT_DESCS } from "../game/unitDescs.ts";
  import { Factory, RACE_TRANSH, TU, type ModInfo } from "@supreme/shared";
  import { keyOf } from "../game/keys.svelte.ts";
  import { sprite } from "./sprites.ts";
  import Cost from "./Cost.svelte";
  import Icon from "./Icon.svelte";

  // `mi` : fiche du porteur ; `refs` : tous les porteurs sélectionnés du même type (ordres donnés à tous)
  let { mi, refs }: { mi: ModInfo; refs: number[] } = $props();
  const d = $derived(ui.data);
  const mods = $derived(d?.mods ?? []);
  const isArk = $derived(!!d && d.units[mi.host]?.key === "ark");
  const slots = $derived(d ? (isArk ? d.arkSlots : [d.oneSlot]) : []);
  const list = $derived(mods.map((m, i) => ({ m, i })).filter(({ m, i }) => i > 0 && m.host === mi.host));
  const job = $derived(mi.job ? mods[mi.job] : null);
  /** palier `id` installé, ou dépassé par un palier plus haut de sa branche */
  const reached = (id: number): boolean => {
    for (let k = mi.mods[mods[id].slot] ?? 0; k; k = mods[k].base) if (k === id) return true;
    return false;
  };
  const ROMAN = ["", "I", "II", "III"];
  /** plus haut palier de la branche de `id` (1 : pas de paliers) */
  const branchRanks = (id: number): number => {
    let top = id;
    for (;;) {
      const n = mods.findIndex((m) => m.base === top);
      if (n < 0) return mods[top].rank;
      top = n;
    }
  };
  type St = "on" | "past" | "job" | "lock" | "base" | "busy" | "poor" | "ok";
  const state = (id: number): St => {
    const m = mods[id];
    if (mi.job === id) return "job";
    if (mi.mods[m.slot] === id) return "on";
    if (reached(id)) return "past";
    if (!hasTechUI(m.tech)) return "lock";
    if (m.base && mi.mods[m.slot] !== m.base) return "base";
    if (mi.job) return "busy";
    return canPay(mi.reach, m.cost) ? "ok" : "poor";
  };
  const secs = (t: number) => Math.ceil(t / 20);
  const ark = $derived(mi.ark);
  /** nom du type de tourelle et son icône */
  const TUR = [
    { icon: "tur_gun", name: "Mitrailleuse", desc: "40 dégâts par seconde contre le sol, portée 18 cases." },
    { icon: "tur_aa", name: "Antiaérienne", desc: "60 dégâts par seconde en zone contre les avions, portée 28 cases." },
    { icon: "tur_mortar", name: "Mortier", desc: "110 dégâts en zone toutes les 4 s, portée 32 cases ; ne tire pas à moins de 7 cases." },
  ];
  const turText = (t: [number, number, number, number, number, number, number]): string => {
    const [kind, want, st, timer, hp, up] = t;
    const s =
      st === TU.ABOARD ? "à bord" + (hp < 1000 ? `, en réparation (${Math.round(hp / 10)} %)` : ", prête") :
      st === TU.OUT ? (up ? "déployée" : "se déploie") :
      st === TU.RETURN ? "rentre à bord" :
      st === TU.LOST ? (timer ? `détruite, reconstruite dans ${secs(timer)} s` : "détruite, attend ses composants") :
      `conversion, encore ${secs(timer)} s`;
    return `${TUR[kind]?.name ?? "?"} : ${s}${want !== kind ? ` ; deviendra ${TUR[want]?.name.toLowerCase()} à bord` : ""}`;
  };
  const outN = $derived(ark ? ark.turrets.filter((t) => t[2] === TU.OUT || t[2] === TU.RETURN).length : 0);
  const workUnits = $derived(d && isArk && ark && mods[mi.mods[2]]?.key === "ark_workshop" ? factoryUnitKinds(d, Factory.Land, RACE_TRANSH).map((i) => ({ u: d.units[i], i })) : []);
  const abbrev = (n: string) => n.split(/[\s-]/).map((w) => w[0]).join("").slice(0, 3).toUpperCase();
</script>

{#if d && list.length}
  <div class="mods">
    <div class="mh"><span class="kicker">Améliorations{isArk ? " de l'Arche" : ""}</span>{#if refs.length > 1}<span class="dim small">appliquées aux <span class="num">{refs.length}</span> sélectionnés, payées une à une</span>{/if}</div>
    {#each slots as sl, si}
      {@const cur = mods[mi.mods[si] ?? 0]}
      <div class="slot">
        <div class="sn" title={isArk ? `Emplacement ${sl.name.toLowerCase()} : une seule branche à la fois` : "Un seul aménagement à la fois ; il est gardé au repli et au déploiement"}>
          <Icon name={sl.icon} size={15} />
          <span class="st"><b>{sl.name}</b><span class="dim tiny">{mi.mods[si] ? cur.name : "vide"}</span></span>
        </div>
        <div class="opts">
          {#each list.filter(({ m }) => m.slot === si) as { m, i } (i)}
            {@const s = state(i)}
            <div class="tip">
              <button class="mb {s}" class:branch={m.rank > 1} data-mod={m.key} disabled={s !== "ok"} aria-label={m.name} onclick={() => client.installMod(i, refs)}>
                <Icon name={m.icon} size={19} />
                {#if branchRanks(i) > 1}<span class="rk">{ROMAN[m.rank]}</span>{/if}
                {#if s === "on" || s === "past"}<span class="mk good"><Icon name="check" size={10} stroke={2.4} /></span>{:else if s === "lock" || s === "base"}<span class="mk"><Icon name="lock" size={10} /></span>{/if}
                {#if s === "job"}<span class="jb"><span style:width={100 - (mi.left / Math.max(1, mi.total)) * 100 + "%"}></span></span>{/if}
              </button>
              <div class="tt">
                <b>{m.name}{branchRanks(i) > 1 ? ` (palier ${ROMAN[m.rank]} sur ${ROMAN[branchRanks(i)]})` : ""}</b><br />{m.desc}<br />
                {#if s === "on"}<span class="good">Installée</span>
                {:else if s === "past"}<span class="good">Comprise dans le palier installé</span>
                {:else if s === "job"}<span class="num">Installation : encore {secs(mi.left)} s</span>
                {:else}
                  <span class="num">{m.time} s d'installation</span>
                  <Cost cost={m.cost} have={mi.reach} />
                  {#if s === "lock"}<span class="bad">Recherche : {d.techs[m.tech].name}</span><br />{/if}
                  {#if s === "base"}<span class="bad">Demande d'abord : {mods[m.base].name}</span><br />{/if}
                  {#if s === "busy"}<span class="dim">Une installation est déjà en cours</span><br />{/if}
                  {#if s === "poor"}<span class="bad">Il manque des composants ou des relevés à portée (30 cases)</span><br />{/if}
                  {#if m.base && mi.mods[si] === m.base}<span class="dim">Remplace {mods[m.base].name} (palier suivant)</span>
                  {:else if mi.mods[si] && !reached(i)}<span class="dim">Remplace {cur.name} : l'emplacement ne garde qu'une branche ; la moitié de ses composants est rendue</span>{/if}
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/each}
    {#if job}
      <div class="job">
        <span class="small"><Icon name={job.icon} size={13} /> Installation : <b>{job.name}</b> · <span class="num">{secs(mi.left)} s</span></span>
        <button class="icon-btn danger small" title="Annuler : composants et relevés sont rendus en entier" onclick={() => client.cancelMod(refs)}><Icon name="close" size={12} /> Annuler</button>
        <div class="upbar"><span style:width={100 - (mi.left / Math.max(1, mi.total)) * 100 + "%"}></span></div>
      </div>
    {/if}

    {#if ark && ark.turrets.length}
      <div class="sub">
        <div class="mh">
          <span class="kicker">Tourelles</span><span class="dim small"><span class="num">{outN}</span> dehors sur <span class="num">{ark.turrets.length}</span></span>
          <button class="icon-btn" class:on={ark.out} title={ark.out ? "Replier : elles se replient et reviennent à bord" : "Déployer : à l'arrêt, l'Arche les pose autour d'elle"} onclick={() => client.arkTurrets(ark.out ? 0 : 1)}><Icon name="deploy" size={14} /> {ark.out ? "Replier" : "Déployer"} {#if keyOf("deploy")}<span class="key">{keyOf("deploy")}</span>{/if}</button>
          <button class="icon-btn" class:on={ark.hold} title={ark.hold ? "Consigne : tenir la place. Elles restent où elles sont quand l'Arche part, jusqu'au rappel. Cliquer : suivre l'Arche" : "Consigne : suivre. Quand l'Arche part, elles se replient, la rejoignent et se redéploient là où elle s'arrête. Cliquer : tenir la place"} onclick={() => client.arkTurrets(ark.hold ? 2 : 3)}><Icon name={ark.hold ? "defense" : "assist"} size={14} /> {ark.hold ? "Tiennent la place" : "Suivent l'Arche"}</button>
        </div>
        <div class="turs">
          {#each ark.turrets as t, k}
            <div class="tip">
              <button class="tb s{t[2]}" class:up={t[5] === 1} aria-label={turText(t)} onclick={() => client.arkTurretType(k, (t[1] + 1) % TUR.length)}>
                <Icon name={TUR[t[0]]?.icon ?? "tur_gun"} size={17} />
                {#if t[1] !== t[0]}<span class="mk"><Icon name={TUR[t[1]]?.icon ?? "tur_gun"} size={10} /></span>{/if}
                <span class="thp"><span style:width={(t[2] === TU.LOST ? (t[3] ? 100 - t[3] / 6 : 0) : t[4] / 10) + "%"}></span></span>
              </button>
              <div class="tt"><b>{turText(t)}</b><br />{TUR[t[0]]?.desc}<br /><span class="dim">Clic : choisir {TUR[(t[1] + 1) % TUR.length].name.toLowerCase()} (conversion à bord, 5 s, gratuite)</span>{#if t[2] === TU.LOST && d}<br /><span class="dim">Reconstruction : 30 s, une à la fois</span><Cost cost={d.units[d.turretKinds[t[1]]].cost} have={mi.reach} />{/if}</div>
            </div>
          {/each}
        </div>
        <div class="row small"><span class="dim">Toutes en :</span>
          {#each TUR as tt, k}<button class="icon-btn" class:on={ark.turrets.every((t) => t[1] === k)} title={tt.desc} onclick={() => client.arkTurretType(-1, k)}><Icon name={tt.icon} size={14} /> {tt.name}</button>{/each}
        </div>
      </div>
    {/if}
    {#if ark && mods[mi.mods[3]]?.key === "ark_boost"}
      <div class="row small">
        <button class="icon-btn" class:on={ark.boost > 0} disabled={ark.boostReady > 0} title="Surcharge : 12 s à vitesse +60 % et cadence de tir +50 %, puis 90 s de recharge" onclick={() => client.arkBoost()}><Icon name="mod_boost" size={14} /> Surcharge</button>
        {#if ark.boost > 0}<span class="good">en cours, {secs(ark.boost)} s</span>{:else if ark.boostReady > 0}<span class="dim num">prête dans {secs(ark.boostReady)} s</span>{:else}<span class="dim">prête</span>{/if}
      </div>
    {/if}
    {#if ark && ark.shieldMax > 0}
      {@const sh = ui.unitInfo?.shield ?? 0}
      <div class="row small" title="Le bouclier arrête les tirs venus du dehors qui visent ce qui est dans la bulle. Brisé, il revient après 10 s."><span class="kicker">Bouclier</span><span class="shb"><span style:width={(sh / ark.shieldMax) * 100 + "%"}></span></span><span class="num">{sh} / {ark.shieldMax}</span><span class="dim">· {ark.shieldR} cases</span></div>
    {/if}
    {#if ark && mods[mi.mods[4]]?.key === "ark_dynamo"}
      <div class="row small"><span class="kicker">Groupe</span><span class={ark.dock ? "good" : "dim"}>{ark.dock ? "posé : 500 kW sans combustible" : "à bord : posé après 3 s à l'arrêt"}</span></div>
    {/if}
    {#if workUnits.length && ark}
      <div class="sub">
        <div class="mh"><span class="kicker">Atelier embarqué</span>{#if ark.queue.length}<span class="small">{d.units[ark.queue[0][0]].name}{#if !ark.paid}<span class="bad"> · attend ses composants</span>{/if}</span>{:else}<span class="dim small">file vide</span>{/if}</div>
        {#if ark.queue.length}<div class="upbar"><span style:width={ark.prog / 10 + "%"}></span></div>{/if}
        <div class="wus">
          {#each workUnits as { u, i }}
            {@const ok = hasTechUI(u.tech)}
            {@const q = ark.queue.find((e) => e[0] === i)}
            <div class="tip">
              <button class="wu" class:locked={!ok} disabled={!ok} aria-label={u.name} onclick={(e) => client.arkQueue(i, e.shiftKey ? 5 : 1)} oncontextmenu={(e) => { e.preventDefault(); client.arkQueue(i, e.shiftKey ? -5 : -1); }}>
                {#if sprite("units", u.key)}<img src={sprite("units", u.key)} alt="" />{:else}<span class="ab">{abbrev(u.name)}</span>{/if}
                {#if q}<span class="qn num">{q[1]}</span>{/if}
              </button>
              <div class="tt"><b>{u.name}</b><br />{#if UNIT_DESCS[u.key]}{UNIT_DESCS[u.key]}<br />{/if}{#if !ok}<span class="bad">Recherche : {d.techs[u.tech].name}</span><br />{/if}<span class="num">{Math.ceil(u.build / 0.6)} s</span><Cost cost={u.cost} have={mi.reach} /><span class="dim">Clic : +1 (Maj : +5) · clic droit : −1</span></div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .mods { display: flex; flex-direction: column; gap: 4px; padding: 6px 8px; border: 1px solid var(--line); background: rgba(255, 181, 71, 0.03); }
  .mh { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .slot { display: flex; align-items: center; gap: 8px; }
  .sn { display: flex; align-items: center; gap: 6px; width: 132px; flex-shrink: 0; color: var(--amber); }
  .st { display: flex; flex-direction: column; line-height: 1.15; min-width: 0; color: var(--text, #dfe8ee); }
  .st b { font-size: 11.5px; font-weight: 600; }
  .st .tiny { font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 110px; }
  .opts { display: flex; gap: 4px; flex-wrap: wrap; }
  .mb { position: relative; width: 36px; height: 34px; padding: 0; display: grid; place-items: center; color: var(--good); }
  .mb.branch { margin-left: -3px; border-left-style: dashed; }
  .mb:disabled { opacity: 1; }
  .mb.ok { --b-line: rgba(77, 255, 176, 0.45); }
  .mb.on { color: var(--accent-ink, #04121a); background: var(--accent); --b-line: var(--accent); }
  .mb.past { color: var(--accent); --b-line: rgba(62, 240, 255, 0.4); opacity: 0.75; }
  .mb.poor { color: var(--bad); --b-line: rgba(255, 90, 79, 0.4); }
  .mb.lock, .mb.base, .mb.busy { color: var(--dim); opacity: 0.55; }
  .mb.job { color: var(--amber); --b-line: var(--amber); }
  .rk { position: absolute; left: 2px; bottom: 0; font-size: 8px; font-weight: 700; letter-spacing: 0; }
  .mk { position: absolute; right: 1px; top: 0; line-height: 1; }
  .mb.on .mk { color: inherit; }
  .jb { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255, 255, 255, 0.12); }
  .jb > span { display: block; height: 100%; background: var(--amber); }
  .job { display: grid; grid-template-columns: 1fr auto; gap: 4px 8px; align-items: center; padding-top: 3px; border-top: 1px solid var(--line); }
  .job .upbar { grid-column: 1 / -1; }
  .upbar { height: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.08); overflow: hidden; }
  .upbar span { display: block; height: 100%; background: #f5b342; }
  .sub { display: flex; flex-direction: column; gap: 4px; padding-top: 5px; border-top: 1px solid var(--line); }
  .icon-btn.on { color: var(--accent); border-color: var(--accent); background: rgba(62, 240, 255, 0.12); }
  .row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .turs { display: flex; gap: 4px; flex-wrap: wrap; }
  .tb { position: relative; width: 34px; height: 34px; padding: 0 0 3px; display: grid; place-items: center; color: var(--dim); }
  .tb.s1 { color: var(--amber); --b-line: rgba(255, 181, 71, 0.5); }
  .tb.up { color: var(--good); --b-line: rgba(77, 255, 176, 0.55); }
  .tb.s3 { color: var(--bad); --b-line: rgba(255, 90, 79, 0.5); }
  .tb.s4 { color: var(--accent); }
  .thp { position: absolute; left: 2px; right: 2px; bottom: 2px; height: 3px; background: rgba(255, 255, 255, 0.12); }
  .thp > span { display: block; height: 100%; background: currentColor; }
  .shb { width: 110px; height: 6px; background: rgba(255, 255, 255, 0.08); }
  .shb > span { display: block; height: 100%; background: linear-gradient(90deg, #3e9bff, var(--accent)); }
  .wus { display: flex; gap: 4px; flex-wrap: wrap; }
  .wu { position: relative; width: 44px; height: 44px; padding: 2px; display: grid; place-items: center; }
  .wu img { width: 38px; height: 38px; object-fit: contain; }
  .wu.locked { opacity: 0.4; }
  .ab { font-weight: 700; font-size: 11px; }
  .qn { position: absolute; right: 2px; bottom: 1px; font-size: 11px; color: var(--accent-ink); background: var(--accent); padding: 0 3px; font-weight: 600; }
</style>
