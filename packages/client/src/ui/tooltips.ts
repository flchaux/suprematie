// Infobulles au premier plan : le contenu de `.tip > .tt` survolé est recopié dans un calque unique
// posé sur la page (position fixe), pour ne jamais être coupé par un panneau qui défile ou qui masque
// ce qui dépasse. Placée au-dessus de l'élément s'il y a la place, sinon en dessous, et gardée à
// l'écran. Le contenu est recopié régulièrement tant que l'infobulle est affichée (valeurs vivantes).
let layer: HTMLDivElement | null = null;
let anchor: HTMLElement | null = null;
let refresh = 0;

function source(el: HTMLElement): HTMLElement | null {
  for (const c of el.children) if (c.classList.contains("tt")) return c as HTMLElement;
  return null;
}

function place(): void {
  if (!layer || !anchor) return;
  const r = anchor.getBoundingClientRect();
  const w = layer.offsetWidth;
  const h = layer.offsetHeight;
  const gap = 8;
  let top = r.top - h - gap;
  if (top < 4) top = Math.min(innerHeight - h - 4, r.bottom + gap);
  const left = Math.max(4, Math.min(innerWidth - w - 4, r.left + r.width / 2 - w / 2));
  layer.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

function show(el: HTMLElement): void {
  const tt = source(el);
  if (!tt || !layer) return hide();
  anchor = el;
  layer.innerHTML = tt.innerHTML;
  layer.style.display = "block";
  place();
  clearInterval(refresh);
  refresh = window.setInterval(() => {
    // l'élément a disparu (panneau fermé) : on masque
    if (!anchor || !anchor.isConnected) return hide();
    const t = source(anchor);
    if (t && layer && layer.innerHTML !== t.innerHTML) {
      layer.innerHTML = t.innerHTML;
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
    const el = (e.target as Element | null)?.closest?.(".tip") as HTMLElement | null;
    if (el === anchor) return;
    if (el && source(el)) show(el);
    else hide();
  });
  addEventListener("pointerdown", hide, true);
  addEventListener("scroll", () => place(), true);
  addEventListener("blur", hide);
}
