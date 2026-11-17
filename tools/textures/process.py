"""Rend les textures générées (tools/textures/raw) raccordables et les réduit pour le client.

Chaque texture devient une image 512 x 512 WebP (qualité 92) :
  rouge = détail (luminance centrée sur 0,5 : module la couleur de la pièce ou du joueur),
  vert  = relief (luminance lissée, pour l'éclairage),
  bleu  = rugosité relative (les creux et parties sombres sont plus mates).
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
KEYS = ["armor", "metal", "dark", "hazard", "glass"]


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
    # détail : moyenne 0,5, écart type 0,16
    detail = 0.5 + (lum - lum.mean()) * (0.16 / max(1e-3, lum.std()))
    # relief : luminance lissée, étendue à 0..1
    h = Image.fromarray((np.clip(lum, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    height = np.asarray(h, dtype=np.float32) / 255.0
    height = (height - height.min()) / max(1e-3, height.max() - height.min())
    rough = np.clip(0.5 + (lum.mean() - lum) * 1.2, 0, 1)
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
