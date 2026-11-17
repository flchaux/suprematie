<script lang="ts">
  // Courbe d'une statistique au fil de la partie, une ligne par joueur (SVG fait main).
  // Survol : repère vertical et valeurs de chaque joueur au relevé le plus proche.
  import type { StatSample } from "@supreme/shared";
  import { ui } from "../game/state.svelte.ts";
  import { playerColor, fmt, type Metric } from "./stats.ts";

  let { metric, samples, players }: { metric: Metric; samples: StatSample[]; players: number[] } = $props();

  const W = 360;
  const H = 150;
  const L = 40;
  const R = 10;
  const T = 10;
  const B = 22;
  const PW = W - L - R;
  const PH = H - T - B;

  /** Pas de graduation « rond » et entier (les statistiques sont des nombres entiers), au plus 4 intervalles. */
  function niceStep(max: number): number {
    const raw = Math.max(1, max / 4);
    const m = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const k of m >= 10 ? [1, 2, 2.5, 5, 10] : [1, 2, 5, 10]) if (k * m >= raw) return k * m;
    return 10 * m;
  }

  const geom = $derived.by(() => {
    const t0 = samples.length ? samples[0].tick : 0;
    const t1 = samples.length ? Math.max(samples[samples.length - 1].tick, t0 + 600) : 600;
    let max = 0;
    for (const s of samples)
      for (const i of players) {
        const p = s.players[i];
        if (!p) continue;
        max = Math.max(max, metric.value(p), metric.value2 ? metric.value2(p) : 0);
      }
    const ys = niceStep(max);
    const yMax = ys * Math.max(1, Math.ceil(max / ys));
    const x = (t: number) => L + ((t - t0) / (t1 - t0)) * PW;
    const y = (v: number) => T + PH - (v / yMax) * PH;
    // graduations du temps (minutes)
    const minutes = (t1 - t0) / 1200;
    const step = [0.5, 1, 2, 5, 10, 15, 30, 60, 120].find((s) => minutes / s <= 6) ?? 240;
    const xt: number[] = [];
    for (let m = Math.ceil(t0 / 1200 / step) * step; m * 1200 <= t1 + 1; m += step) xt.push(m);
    const yt: number[] = [];
    for (let v = 0; v <= yMax; v += ys) yt.push(v);
    return { x, y, xt, yt, t0, t1 };
  });

  /** Tracé d'une série (coupé là où le joueur est caché). */
  function path(i: number, f: (p: NonNullable<StatSample["players"][number]>) => number): string {
    let d = "";
    let pen = false;
    for (const s of samples) {
      const p = s.players[i];
      if (!p) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${geom.x(s.tick).toFixed(1)} ${geom.y(f(p)).toFixed(1)}`;
      pen = true;
    }
    return d;
  }

  let hover = $state(-1);
  function onMove(e: PointerEvent) {
    if (!samples.length) return;
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    for (let k = 1; k < samples.length; k++) if (Math.abs(geom.x(samples[k].tick) - vx) < Math.abs(geom.x(samples[best].tick) - vx)) best = k;
    hover = best;
  }
  const hs = $derived(hover >= 0 && hover < samples.length ? samples[hover] : null);
  const rows = $derived(
    hs
      ? players
          .filter((i) => hs.players[i])
          .map((i) => ({ i, v: metric.value(hs.players[i]!), v2: metric.value2 ? metric.value2(hs.players[i]!) : 0 }))
          .sort((a, b) => b.v - a.v)
      : [],
  );
  const mmss = (t: number) => `${Math.floor(t / 1200)}:${String(Math.floor((t % 1200) / 20)).padStart(2, "0")}`;
</script>

<figure class="chart">
  <figcaption>
    <span class="t">{metric.title}</span>
    {#if metric.unit}<span class="u">{metric.unit}</span>{/if}
    {#if metric.legend2}<span class="l2"><i class="solid"></i>{metric.legend2[0]} <i class="dash"></i>{metric.legend2[1]}</span>{/if}
  </figcaption>
  <div class="plot">
    <svg viewBox="0 0 {W} {H}" role="img" aria-label={metric.title} onpointermove={onMove} onpointerleave={() => (hover = -1)}>
      {#each geom.yt as v}
        <line class="grid" x1={L} x2={W - R} y1={geom.y(v)} y2={geom.y(v)} />
        <text class="ax" x={L - 6} y={geom.y(v) + 3.5} text-anchor="end">{fmt(v)}</text>
      {/each}
      {#each geom.xt as m}
        <text class="ax" x={geom.x(m * 1200)} y={H - 6} text-anchor="middle">{m === 0 ? "0" : `${String(m).replace(".", ",")} min`}</text>
      {/each}
      <line class="base" x1={L} x2={W - R} y1={T + PH} y2={T + PH} />
      {#each players as i (i)}
        {#if metric.value2}
          <path d={path(i, metric.value2)} stroke={playerColor(i)} class="line dash" />
        {/if}
        <path d={path(i, metric.value)} stroke={playerColor(i)} class="line" />
        {#if samples.length === 1 && samples[0].players[i]}
          <circle cx={geom.x(samples[0].tick)} cy={geom.y(metric.value(samples[0].players[i]!))} r="3" fill={playerColor(i)} />
        {/if}
      {/each}
      {#if hs}
        <line class="cursor" x1={geom.x(hs.tick)} x2={geom.x(hs.tick)} y1={T} y2={T + PH} />
        {#each rows as r (r.i)}
          <circle class="dot" cx={geom.x(hs.tick)} cy={geom.y(r.v)} r="3.5" fill={playerColor(r.i)} />
        {/each}
      {/if}
    </svg>
    {#if !samples.length}
      <div class="empty dim">Premier relevé dans moins de 30 s</div>
    {/if}
    {#if hs && rows.length}
      <div class="tip-box num" class:left={geom.x(hs.tick) > W * 0.6} style:left="{(geom.x(hs.tick) / W) * 100}%">
        <div class="when">{mmss(hs.tick)}</div>
        {#each rows as r (r.i)}
          <div class="tr"><span class="pc" style:background={playerColor(r.i)}></span><span class="n">{ui.players[r.i]?.name ?? `Joueur ${r.i + 1}`}</span><b>{fmt(r.v)}</b>{#if metric.value2}<span class="dim">/ {fmt(r.v2)}</span>{/if}</div>
        {/each}
      </div>
    {/if}
  </div>
</figure>

<style>
  .chart { margin: 0; min-width: 0; }
  figcaption { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; flex-wrap: wrap; }
  .t { font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; font-size: 11.5px; color: var(--text); }
  .u { font-size: 10.5px; color: var(--dim); }
  .l2 { margin-left: auto; font-size: 10.5px; color: var(--dim); display: inline-flex; align-items: center; gap: 5px; }
  .l2 i { display: inline-block; width: 16px; height: 0; border-top: 2px solid var(--text); }
  .l2 i.dash { border-top-style: dashed; margin-left: 6px; }
  .plot { position: relative; }
  svg { display: block; width: 100%; height: auto; overflow: visible; touch-action: none; }
  .grid { stroke: rgba(110, 200, 235, 0.09); stroke-width: 1; }
  .base { stroke: rgba(110, 200, 235, 0.3); stroke-width: 1; }
  .ax { fill: var(--dim); font-family: var(--font-num); font-size: 9.5px; }
  .line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .line.dash { stroke-width: 1.5; stroke-dasharray: 4 3; opacity: 0.8; }
  .cursor { stroke: rgba(219, 232, 245, 0.45); stroke-width: 1; }
  .dot { stroke: var(--void); stroke-width: 1.5; }
  .empty { position: absolute; inset: 0 0 22px 40px; display: grid; place-items: center; font-size: 11.5px; pointer-events: none; }
  .tip-box {
    position: absolute; top: 4px; transform: translateX(10px); pointer-events: none; z-index: 2;
    background: rgba(6, 12, 20, 0.95); border: 1px solid var(--line-hi); padding: 5px 8px; font-size: 11px;
    display: flex; flex-direction: column; gap: 2px; min-width: 120px; white-space: nowrap;
  }
  .tip-box.left { transform: translateX(calc(-100% - 10px)); }
  .when { color: var(--dim); font-size: 10px; }
  .tr { display: flex; align-items: center; gap: 6px; }
  .tr .n { flex: 1; font-family: var(--font-ui); max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
  .pc { display: inline-block; width: 8px; height: 8px; transform: rotate(45deg); flex-shrink: 0; }
</style>
