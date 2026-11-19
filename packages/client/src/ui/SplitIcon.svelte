<script lang="ts">
  // Pictogramme des sorties d'un répartiteur : entrée par l'arrière (en bas), sorties fléchées (gauche,
  // avant en haut, droite) selon le mode (0 : les trois, 1 : gauche et avant, 2 : droite et avant).
  let { mode, size = 26 }: { mode: number; size?: number } = $props();
  const left = $derived(mode !== 2);
  const right = $derived(mode !== 1);
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <!-- entrée -->
  <path d="M12 22v-6" opacity="0.55" />
  <!-- boîtier -->
  <rect x="9" y="9" width="6" height="6" rx="1" />
  <!-- avant -->
  <path d="M12 9V3M9.5 5.5 12 3l2.5 2.5" />
  {#if left}<path d="M9 12H3M5.5 9.5 3 12l2.5 2.5" />{/if}
  {#if right}<path d="M15 12h6M18.5 9.5 21 12l-2.5 2.5" />{/if}
</svg>
