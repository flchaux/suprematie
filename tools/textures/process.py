"""Rend les textures générées (tools/textures/raw) raccordables et les réduit pour le client.

Chaque texture devient une image 512 x 512 WebP (qualité 92) :
  rouge = détail (luminance centrée sur 0,5 : module la couleur de la pièce ou du joueur),
  vert  = relief (luminance lissée, pour l'éclairage),
  bleu  = rugosité relative (les creux et parties sombres sont plus mates) ; matières de récupération : part
          d'usure (rouille, taches, vert-de-gris ; voir `wear` dans TUNING).
Le raccord des bords : fondu, sur une bande près des bords, avec l'image décalée d'une demi-largeur
(dont les bords sont ceux du milieu de l'image d'origine, donc continus).

Textures du sol (raw/ground_<clé>.png) : en couleur, 512 x 512 WebP dans assets/ground/, ramenées à
la couleur moyenne et au contraste fixés dans manifest.mjs (GROUND) pour que les couches se
raccordent et que le sol reste moins contrasté que les unités.

    python3 tools/textures/process.py
"""
import json
import subprocess
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"
OUT = HERE.parent.parent / "packages" / "client" / "src" / "assets" / "textures"
SIZE = 512
BAND = 0.14  # largeur de la bande de raccord (part de la taille)
KEYS = ["armor", "metal", "dark", "hazard", "glass", "concrete", "chitin", "bark", "flesh", "bone",
        "rapiece", "usure", "tole", "peinture", "rouille", "bache", "planches", "cuivre"]
# Réglages par matière, quand ils diffèrent des valeurs ordinaires :
#   blur   : lissage du relief en pixels (1,2). Sur une matière luisante, un relief fin éclate les reflets en
#            paillettes : la chitine ne garde que la forme de ses plaques ;
#   std    : écart type du détail (0,16). Les stries de l'os, discrètes, deviendraient des veines de bois ;
#   relief : étendue du relief (1 : de 0 à 1 ; 0,5 : de 0,25 à 0,75).
#   wear   : matières de récupération (Transhumants) : le canal bleu n'est plus la rugosité relative mais la part
#            d'usure, lue dans la teinte de l'image : "rust" rouille (et éclats sombres de peinture), "stain" taches,
#            "verdigris" vert-de-gris, "none" aucune. 0,3 : rien ; 0,95 : usure entière (le shader la teinte, voir
#            render/materials.ts) ;
#   blotch : part des larges taches de rouille ajoutées (0 à 1).
TUNING = {
    "chitin": {"blur": 4.0},
    "bone": {"std": 0.1, "relief": 0.5},
    "rapiece": {"std": 0.15, "blur": 3.0, "relief": 0.5, "wear": "rust", "blotch": 0.6},
    "usure": {"std": 0.075, "blur": 3.0, "relief": 0.35, "wear": "rust", "blotch": 0.65},
    "tole": {"std": 0.16, "blur": 3.0, "relief": 0.55, "wear": "rust", "blotch": 0.6},
    "peinture": {"std": 0.11, "blur": 2.4, "relief": 0.5, "wear": "rust", "blotch": 0.62},
    "rouille": {"std": 0.17, "blur": 2.6, "relief": 0.55, "wear": "none"},
    "bache": {"std": 0.11, "blur": 2.0, "relief": 0.6, "wear": "stain"},
    "planches": {"std": 0.15, "blur": 1.8, "relief": 0.8, "wear": "none"},
    "cuivre": {"std": 0.12, "blur": 2.6, "relief": 0.5, "wear": "verdigris"},
}


def seamless(a: np.ndarray) -> np.ndarray:
    n = a.shape[0]
    rolled = np.roll(np.roll(a, n // 2, axis=0), n // 2, axis=1)
    x = np.arange(n)
    d = np.minimum(x, n - 1 - x) / (n * BAND)  # 0 au bord, 1 à l'intérieur de la bande
    w1 = np.clip(d, 0, 1)
    w1 = w1 * w1 * (3 - 2 * w1)
    w = np.minimum.outer(w1, w1)
    return a * w + rolled * (1 - w)


def periodic_noise(n: int, scale: float, seed: int) -> np.ndarray:
    """Bruit lissé périodique (raccordable), valeurs 0..1 ; `scale` : taille des taches en pixels."""
    rng = np.random.default_rng(seed)
    f = np.fft.fft2(rng.standard_normal((n, n)))
    k = np.fft.fftfreq(n)[:, None] ** 2 + np.fft.fftfreq(n)[None, :] ** 2
    f *= np.exp(-k * (np.pi * scale) ** 2)
    a = np.real(np.fft.ifft2(f))
    return (a - a.min()) / max(1e-9, a.max() - a.min())


def ramp(a: np.ndarray, lo: float, hi: float) -> np.ndarray:
    t = np.clip((a - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def wear_mask(key: str, kind: str) -> np.ndarray:
    """Part d'usure (0 à 1) d'une matière de récupération, lue dans la teinte de l'image en couleur."""
    if kind == "none":
        return np.zeros((SIZE, SIZE), dtype=np.float32)
    im = Image.open(RAW / f"{key}.png").convert("RGB").resize((SIZE, SIZE), Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.0))
    r, g, b = np.moveaxis(np.asarray(im, dtype=np.float32) / 255.0, -1, 0)
    if kind == "verdigris":
        c = g - r
        return seamless(ramp(c, float(np.median(c)) + 0.025, float(np.median(c)) + 0.085))
    # rouille, taches : plus orangé que le fond de la matière
    c = r - b
    med = float(np.median(c))
    m = ramp(c, med + 0.015, med + 0.06) if kind == "stain" else ramp(c, med + 0.03, med + 0.13)
    if key == "peinture":
        # éclats de peinture : le métal sombre mis à nu
        lum = 0.3 * r + 0.59 * g + 0.11 * b
        m = np.maximum(m, ramp(float(np.median(lum)) - lum, 0.14, 0.28))
    m = seamless(m)
    # larges coulures de rouille, pour que l'usure se lise aussi de loin (bruit périodique, donc raccordé)
    b = TUNING[key].get("blotch", 0)
    if b:
        seed = 10 * (1 + KEYS.index(key))
        n = sum(w * periodic_noise(SIZE, z, seed + i) for i, (z, w) in enumerate([(36.0, 0.5), (14.0, 0.28), (5.0, 0.22)]))
        spots = ramp(n, float(np.quantile(n, 0.78)), float(np.quantile(n, 0.95)))
        m = np.maximum(m, b * spots * (0.7 + 0.3 * periodic_noise(SIZE, 2.0, seed + 5)))
    return m


def process(key: str) -> None:
    im = Image.open(RAW / f"{key}.png").convert("L").resize((SIZE, SIZE), Image.LANCZOS)
    lum = np.asarray(im, dtype=np.float32) / 255.0
    lum = seamless(lum)
    if key == "hazard":
        # bandes diagonales calculées (période qui divise la taille : raccord parfait) ; usure et éclats
        # de peinture tirés d'un bruit périodique (filtré par transformée de Fourier, donc raccordable)
        y, x = np.mgrid[0:SIZE, 0:SIZE]
        period = SIZE // 4
        phase = ((x + y) % period) / period
        stripe = np.clip((np.abs(phase - 0.5) - 0.25) * 40 + 0.5, 0, 1)  # 1 : bande claire
        chips = periodic_noise(SIZE, 9.0, 1) > 0.7
        grain = periodic_noise(SIZE, 2.0, 2) - 0.5
        paint = np.where(chips, 0.3, stripe)
        lum = 0.2 + paint * 0.6 + grain * 0.12
    tune = TUNING.get(key, {})
    # détail : moyenne 0,5, écart type 0,16
    detail = 0.5 + (lum - lum.mean()) * (tune.get("std", 0.16) / max(1e-3, lum.std()))
    # relief : luminance lissée, étendue à 0..1
    if "blur" in tune:
        # lissage large : sur l'image répétée 3 x 3, pour que le relief reste raccordé aux bords
        tiled = Image.fromarray((np.clip(np.tile(lum, (3, 3)), 0, 1) * 255).astype(np.uint8))
        h = tiled.filter(ImageFilter.GaussianBlur(tune["blur"])).crop((SIZE, SIZE, 2 * SIZE, 2 * SIZE))
    else:
        h = Image.fromarray((np.clip(lum, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    height = np.asarray(h, dtype=np.float32) / 255.0
    height = (height - height.min()) / max(1e-3, height.max() - height.min())
    if "relief" in tune:
        height = 0.5 + (height - 0.5) * tune["relief"]
    rough = np.clip(0.5 + (lum.mean() - lum) * 1.2, 0, 1)
    if "wear" in tune:
        rough = 0.3 + 0.65 * wear_mask(key, tune["wear"])
        print(key, f"usure {float((rough > 0.6).mean()) * 100:.0f} % de la surface")
    rgb = np.stack([detail, height, rough], axis=-1)
    out = Image.fromarray((np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB")
    OUT.mkdir(parents=True, exist_ok=True)
    out.save(OUT / f"{key}.webp", "WEBP", quality=92, method=6)
    print(key, f"moyenne {detail.mean():.3f}", f"{(OUT / f'{key}.webp').stat().st_size // 1024} Ko")


def ground_manifest() -> list:
    """Lit la liste GROUND de manifest.mjs (via node)."""
    code = "import('./manifest.mjs').then((m) => console.log(JSON.stringify(m.GROUND)))"
    out = subprocess.run(["node", "--input-type=module", "-e", code], cwd=HERE, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def process_ground(g: dict) -> None:
    src = RAW / f"ground_{g['key']}.png"
    if not src.exists():
        print("absente :", src.name)
        return
    im = Image.open(src).convert("RGB").resize((SIZE, SIZE), Image.LANCZOS)
    rgb = np.asarray(im, dtype=np.float32) / 255.0
    rgb = np.stack([seamless(rgb[..., c]) for c in range(3)], axis=-1)
    lum = rgb @ np.array([0.3, 0.55, 0.15], dtype=np.float32)
    # écarts à la moyenne ramenés au contraste visé, puis recentrés sur la couleur visée
    dev = (rgb - rgb.reshape(-1, 3).mean(axis=0)) * (g["contrast"] / max(1e-3, float(lum.std())))
    lin = np.array(g["mean"], dtype=np.float32)
    srgb = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
    out = np.clip(srgb + dev, 0, 1)
    dst = OUT.parent / "ground" / f"{g['key']}.webp"
    dst.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGB").save(dst, "WEBP", quality=90, method=6)
    print("sol", g["key"], f"{dst.stat().st_size // 1024} Ko")


for k in KEYS:
    if (RAW / f"{k}.png").exists():
        process(k)
for g in ground_manifest():
    process_ground(g)
