// Curseurs contextuels (comme Supreme Commander) : la forme indique ce qu'un clic ferait à cet endroit.
// Dessins SVG 32 x 32 intégrés (contour sombre pour rester lisibles sur tout fond), point actif précisé.

export type CursorKind =
  | "default"
  | "select"
  | "move"
  | "attack"
  | "attackMove"
  | "target"
  | "patrol"
  | "assist"
  | "repair"
  | "reclaim"
  | "load"
  | "unload"
  | "rally"
  | "build"
  | "invalid"
  | "grab";

const OUT = "#05090e";
const ARROW = "M3 2 L3 24 L9 18.5 L13 28 L17.5 26 L13.5 16.8 L21.5 16.8 Z";

const arrow = (fill: string, extra = ""): string =>
  `<path d="${ARROW}" fill="${fill}" stroke="${OUT}" stroke-width="1.6" stroke-linejoin="round"/>${extra}`;

const cross = (c: string): string =>
  `<circle cx="16" cy="16" r="9" fill="none" stroke="${OUT}" stroke-width="4.5"/>` +
  `<circle cx="16" cy="16" r="9" fill="none" stroke="${c}" stroke-width="2.2"/>` +
  [["16", "2", "16", "9"], ["16", "23", "16", "30"], ["2", "16", "9", "16"], ["23", "16", "30", "16"]]
    .map(([a, b, c2, d]) => `<line x1="${a}" y1="${b}" x2="${c2}" y2="${d}" stroke="${OUT}" stroke-width="4.5" stroke-linecap="round"/><line x1="${a}" y1="${b}" x2="${c2}" y2="${d}" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>`)
    .join("") +
  `<circle cx="16" cy="16" r="2" fill="${c}" stroke="${OUT}" stroke-width="1"/>`;

/** pastille en bas à droite d'une flèche : symbole d'action */
const badge = (c: string, inner: string): string =>
  `<circle cx="23" cy="23" r="7.5" fill="${OUT}"/><circle cx="23" cy="23" r="6.2" fill="${c}"/>${inner}`;

const SVG: Record<Exclude<CursorKind, "grab">, [string, number, number]> = {
  default: [arrow("#e6f6ff"), 3, 2],
  select: [
    arrow(
      "#e6f6ff",
      `<path d="M16 21v-4h4M31 21v-4h-4M16 26v4h4M31 26v4h-4" fill="none" stroke="${OUT}" stroke-width="4" stroke-linecap="square"/>` +
        `<path d="M16 21v-4h4M31 21v-4h-4M16 26v4h4M31 26v4h-4" fill="none" stroke="#3ef0ff" stroke-width="2" stroke-linecap="square"/>`,
    ),
    3,
    2,
  ],
  move: [arrow("#5dff8f", `<path d="M19 20l4 3-4 3M24 20l4 3-4 3" fill="none" stroke="${OUT}" stroke-width="3.4" stroke-linecap="round"/><path d="M19 20l4 3-4 3M24 20l4 3-4 3" fill="none" stroke="#5dff8f" stroke-width="1.8" stroke-linecap="round"/>`), 3, 2],
  attack: [cross("#ff4b4b"), 16, 16],
  attackMove: [cross("#ff9a3c"), 16, 16],
  target: [cross("#ffc247"), 16, 16],
  patrol: [arrow("#3ef0ff", badge("#3ef0ff", `<path d="M19.5 22a3.6 3.6 0 0 1 6.6-1.6M26.5 24a3.6 3.6 0 0 1-6.6 1.6" fill="none" stroke="${OUT}" stroke-width="1.6"/><path d="M26.3 18.6v2.2h-2.2M19.7 27.4v-2.2h2.2" fill="none" stroke="${OUT}" stroke-width="1.6"/>`)), 3, 2],
  assist: [arrow("#5dff8f", badge("#5dff8f", `<path d="M23 18.5l4 1.6v2.6c0 2.5-1.7 4.3-4 5.3-2.3-1-4-2.8-4-5.3v-2.6z" fill="${OUT}"/>`)), 3, 2],
  repair: [arrow("#5dff8f", badge("#5dff8f", `<path d="M20 26.5l4.2-4.2M24.5 19.2a2.6 2.6 0 1 0 2.3 2.3l-1.5.4-.9-.9.4-1.5z" fill="none" stroke="${OUT}" stroke-width="1.8" stroke-linecap="round"/>`)), 3, 2],
  reclaim: [arrow("#ffd23e", badge("#ffd23e", `<path d="M23 18.8l3.4 5.8h-6.8z" fill="none" stroke="${OUT}" stroke-width="1.6" stroke-linejoin="round"/><circle cx="23" cy="22.8" r="1" fill="${OUT}"/>`)), 3, 2],
  load: [arrow("#5dff8f", badge("#5dff8f", `<path d="M23 27v-7M20 22.5l3-3 3 3" fill="none" stroke="${OUT}" stroke-width="1.8" stroke-linecap="round"/>`)), 3, 2],
  unload: [arrow("#5dff8f", badge("#5dff8f", `<path d="M23 19v7M20 23.5l3 3 3-3" fill="none" stroke="${OUT}" stroke-width="1.8" stroke-linecap="round"/>`)), 3, 2],
  rally: [arrow("#5dff8f", badge("#5dff8f", `<path d="M21 27.5v-9M21 18.8h5.5l-1.5 2 1.5 2H21" fill="${OUT}" stroke="${OUT}" stroke-width="1.4" stroke-linejoin="round"/>`)), 3, 2],
  build: [arrow("#3ef0ff", badge("#3ef0ff", `<path d="M23 19.5v7M19.5 23h7" stroke="${OUT}" stroke-width="2.2" stroke-linecap="round"/>`)), 3, 2],
  invalid: [
    `<circle cx="16" cy="16" r="10" fill="none" stroke="${OUT}" stroke-width="5.5"/><circle cx="16" cy="16" r="10" fill="none" stroke="#ff4b4b" stroke-width="3"/>` +
      `<line x1="9" y1="23" x2="23" y2="9" stroke="${OUT}" stroke-width="5.5"/><line x1="9" y1="23" x2="23" y2="9" stroke="#ff4b4b" stroke-width="3"/>`,
    16,
    16,
  ],
};

const FALLBACK: Record<CursorKind, string> = {
  default: "default",
  select: "pointer",
  move: "default",
  attack: "crosshair",
  attackMove: "crosshair",
  target: "crosshair",
  patrol: "default",
  assist: "pointer",
  repair: "pointer",
  reclaim: "pointer",
  load: "pointer",
  unload: "pointer",
  rally: "pointer",
  build: "copy",
  invalid: "not-allowed",
  grab: "grabbing",
};

const cache = new Map<CursorKind, string>();

/** Valeur CSS `cursor` du curseur `kind` (image SVG avec son point actif, puis curseur système). */
export function cursorCss(kind: CursorKind): string {
  const hit = cache.get(kind);
  if (hit) return hit;
  let css = FALLBACK[kind];
  if (kind !== "grab") {
    const [body, hx, hy] = SVG[kind];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${body}</svg>`;
    css = `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hx} ${hy}, ${FALLBACK[kind]}`;
  }
  cache.set(kind, css);
  return css;
}
