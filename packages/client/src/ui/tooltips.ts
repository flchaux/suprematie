// Infobulles au premier plan : le contenu de `.tip > .tt` survolé est recopié dans un calque unique
// posé sur la page (position fixe), pour ne jamais être coupé par un panneau qui défile ou qui masque
// ce qui dépasse. Placée au-dessus de l'élément s'il y a la place, sinon en dessous, et gardée à
// l'écran. Le contenu est recopié régulièrement tant que l'infobulle est affichée (valeurs vivantes).
// Ressources (`[data-item]`, Item.svelte) : leur description, seule ou à la suite de l'infobulle (ou du
// `title`) de l'élément qui les contient.
let layer: HTMLDivElement | null = null;
/** élément survolé : la ressource s'il y en a une, sinon l'élément `.tip` */
let anchor: HTMLElement | null = null;
let refresh = 0;
let itemHtml: (id: number, named: boolean) => string = () => "";

/** Donne le contenu de l'infobulle d'une ressource (`named` : avec son nom en titre). */
export function setItemTips(f: (id: number, named: boolean) => string): void {
  itemHtml = f;
}

function source(el: HTMLElement): HTMLElement | null {
  for (const c of el.children) if (c.classList.contains("tt")) return c as HTMLElement;
  return null;
}

/** Infobulle propre (`.tt`) qui s'applique à l'élément : la sienne, ou celle d'un élément qui le contient. */
function tipOf(el: HTMLElement): HTMLElement | null {
  const t = el.closest<HTMLElement>(".tip");
  return t && source(t) ? t : null;
}

function content(el: HTMLElement): string {
  const tip = tipOf(el);
  const own = tip ? source(tip)!.innerHTML : "";
  const id = Number(el.dataset.item ?? 0);
  // `.full` : l'infobulle décrit déjà la ressource (barre de la zone)
  if (!(id > 0) || (tip && source(tip)!.classList.contains("full"))) return own;
  const item = itemHtml(id, !own);
  if (own) return item ? `${own}<div class="more">${item}</div>` : own;
  const title = el.parentElement?.closest<HTMLElement>("[title]:not([title=''])")?.title;
  if (!title) return item;
  const d = document.createElement("div");
  d.className = "more";
  d.textContent = title;
  return item + d.outerHTML;
}

function place(): void {
  if (!layer || !anchor) return;
  const r = (tipOf(anchor) ?? anchor).getBoundingClientRect();
  const w = layer.offsetWidth;
  const h = layer.offsetHeight;
  const gap = 8;
  let top = r.top - h - gap;
  if (top < 4) top = Math.min(innerHeight - h - 4, r.bottom + gap);
  const left = Math.max(4, Math.min(innerWidth - w - 4, r.left + r.width / 2 - w / 2));
  layer.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

function show(el: HTMLElement): void {
  const html = content(el);
  if (!html || !layer) return hide();
  anchor = el;
  layer.innerHTML = html;
  layer.style.display = "block";
  place();
  clearInterval(refresh);
  let last = html;
  refresh = window.setInterval(() => {
    // l'élément a disparu (panneau fermé) : on masque
    if (!anchor || !anchor.isConnected) return hide();
    const t = content(anchor);
    if (layer && t !== last) {
      last = t;
      layer.innerHTML = t;
      place();
    }
  }, 250);
}

function hide(): void {
  anchor = null;
  clearInterval(refresh);
  if (layer) layer.style.display = "none";
}

export function installTooltips(): void {
  if (layer) return;
  layer = document.createElement("div");
  layer.className = "tt-float";
  layer.setAttribute("role", "tooltip");
  document.body.appendChild(layer);
  addEventListener("pointerover", (e) => {
    const t = e.target as Element | null;
    const el = (t?.closest?.("[data-item]") ?? t?.closest?.(".tip") ?? null) as HTMLElement | null;
    if (el === anchor) return;
    if (el) show(el);
    else hide();
  });
  addEventListener("pointerdown", hide, true);
  addEventListener("scroll", () => place(), true);
  addEventListener("blur", hide);
}
