"""Réduit les images générées (tools/sprites/raw) en WebP pour le client.

Icônes : recadrées sur la partie visible (canal alpha), centrées dans un carré avec une marge,
128 px (objets 96 px). Illustrations : l'image de fond en 1920 px de large, l'emblème en 256 px.

    python3 tools/sprites/process.py
"""
from pathlib import Path
from PIL import Image

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
    total = sum(p.stat().st_size for p in OUT.rglob("*.webp"))
    print(f"{n} images -> {OUT} ({total / 1024:.0f} Kio)")


if __name__ == "__main__":
    main()
