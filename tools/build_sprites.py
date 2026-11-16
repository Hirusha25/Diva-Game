"""Turn the raw artwork into game-ready sprites.

Each sprite is cropped tight to its visible pixels (so its bottom edge is the
point that touches the ground), has its edge colour bled into the transparent
area (so it doesn't get a dark halo when scaled), and is saved as WebP.

Run from the repo root:  python3 tools/build_sprites.py
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "sprites"

# output name -> (source file, longest side in px)
SPRITES = {
    "tree-1": ("ChatGPT Image Nov 5, 2026, 01_45_40 PM-1.png", 768),
    "tree-2": ("ChatGPT Image Nov 5, 2026, 01_45_41 PM-2.png", 768),
    "tree-3": ("ChatGPT Image Nov 5, 2026, 01_45_43 PM-3.png", 768),
    "tree-4": ("ChatGPT Image Nov 5, 2026, 01_45_44 PM-4.png", 768),
    "bush-white-wide": ("ChatGPT Image Nov 5, 2026, 01_54_49 PM-1.png", 512),
    "bush-pink-wide": ("ChatGPT Image Nov 5, 2026, 01_54_50 PM-2.png", 512),
    "bush-white-tall": ("ChatGPT Image Nov 7, 2026, 08_36_35 AM-1.png", 512),
    "bush-mixed": ("ChatGPT Image Nov 7, 2026, 08_36_36 AM-2.png", 512),
    "bush-row": ("ChatGPT Image Nov 7, 2026, 08_36_37 AM-3.png", 640),
    "bush-white": ("ChatGPT Image Nov 7, 2026, 08_36_38 AM-4.png", 512),
    "bus-stop": ("ChatGPT Image Nov 5, 2026, 01_54_52 PM-4.png", 768),
    "bus-stop-diva": ("Diva Fresh Blooming Bus Stop.png", 768),
    "cloud-1": ("ChatGPT Image Nov 5, 2026, 09_53_45 AM-1.png", 768),
    "cloud-2": ("ChatGPT Image Nov 5, 2026, 09_53_46 AM-2.png", 768),
    "cloud-3": ("ChatGPT Image Nov 5, 2026, 09_53_53 AM-3.png", 768),
    "cloud-4": ("Fluffy Cartoon Cloud Asset.png", 640),
}


def bleed(im: Image.Image) -> Image.Image:
    """Fill transparent pixels with the colour of the nearest visible ones."""
    a = np.asarray(im, dtype=np.float32) / 255.0
    rgb, alpha = a[..., :3], a[..., 3:4]
    out = rgb * (alpha > 0.5)
    known = (alpha > 0.5).astype(np.float32)
    for radius in (2, 4, 8, 16, 32, 64):
        pm = Image.fromarray((out * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius))
        kn = Image.fromarray((known[..., 0] * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius))
        pm = np.asarray(pm, dtype=np.float32) / 255.0
        kn = np.asarray(kn, dtype=np.float32)[..., None] / 255.0
        fill = np.where(kn > 0.01, pm / np.maximum(kn, 0.01), 0)
        newly = (known < 0.5) & (kn > 0.01)
        out = np.where(newly, fill, out)
        known = np.where(newly, 1.0, known)
    res = np.concatenate([np.clip(out, 0, 1), alpha], axis=-1)
    return Image.fromarray((res * 255).astype(np.uint8), "RGBA")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (src, size) in SPRITES.items():
        im = Image.open(ROOT / src).convert("RGBA")
        # ignore near-invisible stray pixels when finding the crop box
        box = im.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
        im = im.crop(box)
        im.thumbnail((size, size), Image.LANCZOS)
        im = bleed(im)
        im.save(OUT / f"{name}.webp", quality=88, method=6, exact=True)
        print(f"{name:18s} {im.size[0]:4d}x{im.size[1]:<4d} {(OUT / f'{name}.webp').stat().st_size // 1024:4d} KB")


if __name__ == "__main__":
    main()
