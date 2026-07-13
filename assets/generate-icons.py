#!/usr/bin/env python3
"""Generate every favicon / app icon from assets/icon.png.

Run from the repo root, after changing the source icon:

    uv run --with pillow python assets/generate-icons.py

Outputs land in frontend/public/, which Vite copies verbatim into the build, so
nginx serves them from the site root.

Two details that are easy to get wrong:

* Transparency. The source has a transparent surround outside its rounded corners.
  That is right for a favicon on a light or dark tab strip, but wrong for
  apple-touch-icon: iOS composites transparency onto BLACK, so the rounded corners
  would show as black notches against the icon's navy. Those icons are therefore
  flattened onto the icon's own background colour first.

* Maskable icons. Android may crop an adaptive icon to a circle, cutting ~20% off
  each edge. A full-bleed icon loses its frame that way, so the maskable variant is
  scaled down inside a safe zone with the background extended behind it.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "icon.png"
OUT = ROOT / "frontend" / "public"

# Sampled from the source icon, not guessed. Used for the browser theme colour, and
# to flatten the icons that cannot carry transparency.
BACKGROUND = (45, 60, 83)  # #2d3c53

# Android maskable icons get cropped to a circle inscribed in the safe zone. Keeping
# the artwork inside 80% of the canvas means nothing important is ever clipped.
MASKABLE_SAFE_ZONE = 0.80


def load() -> Image.Image:
    if not SOURCE.exists():
        raise SystemExit(f"missing source icon: {SOURCE}")
    return Image.open(SOURCE).convert("RGBA")


def flatten(img: Image.Image) -> Image.Image:
    """Composite onto the icon's own background, so transparency never becomes black."""
    canvas = Image.new("RGBA", img.size, (*BACKGROUND, 255))
    canvas.alpha_composite(img)
    return canvas


def resized(img: Image.Image, size: int) -> Image.Image:
    return img.resize((size, size), Image.Resampling.LANCZOS)


def maskable(img: Image.Image, size: int) -> Image.Image:
    """Artwork inset inside the safe zone, background extended behind it."""
    canvas = Image.new("RGBA", (size, size), (*BACKGROUND, 255))
    inner = int(size * MASKABLE_SAFE_ZONE)
    offset = (size - inner) // 2
    canvas.alpha_composite(resized(img, inner), (offset, offset))
    return canvas


def main() -> None:
    src = load()
    OUT.mkdir(parents=True, exist_ok=True)

    # Browser tabs. Transparency is wanted here.
    for size in (16, 32, 48):
        resized(src, size).save(OUT / f"favicon-{size}x{size}.png", optimize=True)

    # A multi-resolution .ico, still the most reliable fallback across old browsers
    # and Windows shortcuts.
    resized(src, 48).save(
        OUT / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )

    # iOS home screen. Flattened: iOS renders alpha as black, and applies its own
    # rounding, so we hand it a full-bleed square.
    flat = flatten(src)
    resized(flat, 180).save(OUT / "apple-touch-icon.png", optimize=True)

    # PWA / Android. 192 and 512 are the sizes the spec and Lighthouse expect.
    for size in (192, 512):
        resized(flat, size).save(OUT / f"icon-{size}.png", optimize=True)

    maskable(src, 512).save(OUT / "icon-maskable-512.png", optimize=True)

    # A large PNG for the README and any social preview.
    resized(src, 256).save(OUT / "icon-256.png", optimize=True)

    for path in sorted(OUT.glob("*")):
        if path.suffix in {".png", ".ico"}:
            print(f"  {path.relative_to(ROOT)}  ({path.stat().st_size / 1024:.1f} KiB)")


if __name__ == "__main__":
    main()
