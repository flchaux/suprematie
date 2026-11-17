"""Réduit les images générées (tools/sprites/raw) en WebP pour le client.

Icônes : recadrées sur la partie visible (canal alpha), centrées dans un carré avec une marge,
128 px (objets 96 px). Illustrations : l'image de fond en 1920 px de large, l'emblème en 256 px.
Décorations du sol : un atlas de 4 x 4 cases de 256 px (ordre de DECOR dans manifest.mjs), chaque
image posée en bas de sa case (le pied du panneau), la couleur étendue sous les parties
transparentes (pas de liseré sombre aux niveaux de détail réduits).

    python3 tools/sprites/process.py
"""
import json
import subprocess
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"
OUT = HERE.parent.parent / "packages" / "client" / "src" / "assets" / "sprites"
SIZES = {"items": 96, "buildings": 128, "units": 128}


def icon(src: Path, dst: Path, size: int) -> None:
    im = Image.open(src).convert("RGBA")
    # alpha très faible (halo du détourage) ignoré pour le cadrage
    alpha = im.getchannel("A").point(lambda a: 255 if a > 24 else 0)
    box = alpha.getbbox() or (0, 0, im.width, im.height)
    im = im.crop(box)
    side = int(max(im.width, im.height) * 1.08)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    canvas = canvas.resize((size, size), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(dst, "WEBP", quality=90, method=6)


DECOR_CELL = 256
DECOR_COLS = 4


def bleed(im: Image.Image) -> Image.Image:
    """Étend la couleur des pixels opaques sous les pixels transparents (alpha conservé)."""
    a = np.asarray(im, dtype=np.float32) / 255.0
    rgb, alpha = a[..., :3], a[..., 3:]
    acc = rgb * alpha
    w = alpha.copy()
    out = rgb.copy()
    filled = alpha[..., 0] > 0.5
    for radius in (1, 2, 4, 8, 16, 32):
        blur = lambda x: np.asarray(Image.fromarray((x * 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(radius)), dtype=np.float32) / 255.0
        ca = np.stack([blur(acc[..., c]) for c in range(3)], axis=-1)
        cw = blur(w[..., 0])[..., None]
        fill = (~filled) & (cw[..., 0] > 0.01)
        out[fill] = (ca / np.maximum(cw, 1e-4))[fill]
        filled |= fill
    res = np.concatenate([np.clip(out, 0, 1), alpha], axis=-1)
    return Image.fromarray((res * 255 + 0.5).astype(np.uint8), "RGBA")


def decor_atlas() -> int:
    code = "import('./manifest.mjs').then((m) => console.log(JSON.stringify(Object.keys(m.DECOR))))"
    keys = json.loads(subprocess.run(["node", "--input-type=module", "-e", code], cwd=HERE, capture_output=True, text=True, check=True).stdout)
    rows = (len(keys) + DECOR_COLS - 1) // DECOR_COLS
    atlas = Image.new("RGBA", (DECOR_COLS * DECOR_CELL, max(1, rows) * DECOR_CELL), (0, 0, 0, 0))
    n = 0
    for i, key in enumerate(keys):
        src = RAW / "decor" / f"{key}.png"
        if not src.exists():
            print("décoration absente :", key)
            continue
        im = Image.open(src).convert("RGBA")
        alpha = im.getchannel("A").point(lambda a: 255 if a > 24 else 0)
        im = im.crop(alpha.getbbox() or (0, 0, im.width, im.height))
        inner = DECOR_CELL - 8
        k = inner / max(im.width, im.height)
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        x0 = (i % DECOR_COLS) * DECOR_CELL + (DECOR_CELL - im.width) // 2
        y0 = (i // DECOR_COLS) * DECOR_CELL + DECOR_CELL - 2 - im.height
        atlas.alpha_composite(im, (x0, y0))
        n += 1
    dst = OUT.parent / "decor" / "atlas.webp"
    dst.parent.mkdir(parents=True, exist_ok=True)
    bleed(atlas).save(dst, "WEBP", quality=88, method=6)
    print(f"décorations : {n} images -> {dst} ({dst.stat().st_size // 1024} Kio)")
    return n


def main() -> None:
    n = 0
    for cat, size in SIZES.items():
        for src in sorted((RAW / cat).glob("*.png")):
            icon(src, OUT / cat / (src.stem + ".webp"), size)
            n += 1
    art = RAW / "art"
    if (art / "keyart.png").exists():
        im = Image.open(art / "keyart.png").convert("RGB")
        w = 1920
        im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        (OUT / "art").mkdir(parents=True, exist_ok=True)
        im.save(OUT / "art" / "keyart.webp", "WEBP", quality=78, method=6)
        n += 1
    if (art / "emblem.png").exists():
        icon(art / "emblem.png", OUT / "art" / "emblem.webp", 256)
        n += 1
    if (RAW / "decor").exists():
        decor_atlas()
    total = sum(p.stat().st_size for p in OUT.rglob("*.webp"))
    print(f"{n} images -> {OUT} ({total / 1024:.0f} Kio)")


if __name__ == "__main__":
    main()
