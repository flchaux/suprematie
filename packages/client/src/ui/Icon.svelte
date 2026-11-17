<script lang="ts" module>
  // Icônes vectorielles au trait (24 x 24), dans la charte : traits fins, angles vifs.
  // Les icônes d'objets, de bâtiments et d'unités sont des images générées (voir sprites.ts).
  export const ICONS: Record<string, string> = {
    stop: '<rect x="6" y="6" width="12" height="12"/>',
    attack: '<path d="M4 20 14 10"/><path d="M12 4h8v8"/><path d="M20 4 11 13"/><path d="M6 14l4 4"/>',
    patrol: '<path d="M4 9h13l-3-3"/><path d="M20 15H7l3 3"/>',
    assist: '<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    ground: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="1.5"/>',
    reclaim: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/><path d="M9 12h6"/>',
    deploy: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 21h16"/><path d="M6 21l2-4M18 21l-2-4"/>',
    unload: '<path d="M4 7h16v6H4z"/><path d="M12 13v8"/><path d="M8 17l4 4 4-4"/>',
    teleport: '<ellipse cx="12" cy="18" rx="7" ry="2.5"/><path d="M12 3v11"/><path d="M8 7l4-4 4 4"/>',
    jump: '<path d="M3 12h11"/><path d="M10 6l6 6-6 6"/><path d="M19 5v14"/>',
    power: '<path d="M13 2 5 14h6l-1 8 8-12h-6z"/>',
    units: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><path d="M16 5a3 3 0 0 1 0 6M18 14c2 .8 3 2.8 3 6"/>',
    research: '<path d="M9 3h6"/><path d="M10 3v6L4.5 19A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.5-2L14 9V3"/><path d="M7 15h10"/>',
    stats: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-8"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7v.5"/><path d="M12 17.5v.5"/>',
    volume: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
    icons: '<path d="M12 3 21 12 12 21 3 12z"/><path d="M12 8 16 12 12 16 8 12z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L12 6.3"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    play: '<path d="M7 4v16l13-8z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    production: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
    logistics: '<path d="M3 15h18"/><circle cx="6" cy="18" r="1.6"/><circle cx="12" cy="18" r="1.6"/><circle cx="18" cy="18" r="1.6"/><path d="M6 11h8l-3-3"/><rect x="14" y="7" width="5" height="5"/>',
    energy: '<path d="M13 2 5 14h6l-1 8 8-12h-6z"/>',
    factory: '<path d="M3 21V10l6 4V10l6 4V5h6v16z"/><path d="M7 18h2M12 18h2M17 18h2"/>',
    defense: '<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/>',
    special: '<path d="M12 2 14.6 8.6 21.5 9.3 16.3 13.9 17.9 20.7 12 17.1 6.1 20.7 7.7 13.9 2.5 9.3 9.4 8.6z"/>',
    lock: '<rect x="5" y="11" width="14" height="10"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    check: '<path d="M4 12l5 5L20 6"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
    team: '<path d="M12 3 20 7v6c0 4-3.4 7.2-8 8-4.6-.8-8-4-8-8V7z"/><path d="M12 8v8M8 12h8"/>',
    bot: '<rect x="5" y="8" width="14" height="11"/><path d="M12 4v4"/><circle cx="12" cy="3.5" r="1"/><path d="M9 13h.5M14.5 13h.5"/><path d="M9.5 16.5h5"/>',
    map: '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
    water: '<path d="M12 3c3.5 4.5 6 7.7 6 11a6 6 0 0 1-12 0c0-3.3 2.5-6.5 6-11z"/>',
    seed: '<path d="M4 12h16M12 4v16"/><circle cx="12" cy="12" r="8"/>',
    replay: '<path d="M4 4v6h6"/><path d="M5 14a8 8 0 1 0 2-8.4L4 10"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    rally: '<path d="M6 21V4"/><path d="M6 4l12 4-12 4"/>',
    repeat: '<path d="M4 11V8a3 3 0 0 1 3-3h11l-3-3"/><path d="M20 13v3a3 3 0 0 1-3 3H6l3 3"/>',
  };
</script>

<script lang="ts">
  let { name, size = 16, stroke = 1.7, title = "" }: { name: string; size?: number; stroke?: number; title?: string } = $props();
</script>

<svg class="ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={stroke} stroke-linecap="square" stroke-linejoin="miter" aria-hidden={title ? undefined : "true"} role={title ? "img" : undefined}>
  {#if title}<title>{title}</title>{/if}
  {@html ICONS[name] ?? ""}
</svg>

<style>
  .ic { display: inline-block; flex-shrink: 0; vertical-align: -0.2em; }
</style>
