"""
Render the icons and the store images from the SVG sources in store-assets/svg.

  logo.svg                 the logo, with rounded corners  -> icons/icon16|48|128.png, store_logo_300.png
  logo-flat.svg            the logo, full square, no alpha -> store_icon_128.png (forms that refuse alpha)
  screenshot-schedule.svg  1280x800                        -> screenshot_schedule.png
  promo-small.svg          440x280                         -> small_promo_tile.png
  promo-marquee.svg        1400x560                        -> marquee_promo.png
  social-preview.svg       1280x640                        -> github_social_preview.png

The screenshots of the real popup and options page are made by screenshots.py, from the real pages.

Usage: python3 store-assets/render.py
Requires: pip install cairosvg pillow  (the text uses DejaVu Sans, or Verdana or Arial when it is missing)
"""

from io import BytesIO
from pathlib import Path

import cairosvg
from PIL import Image

ROOT = Path(__file__).parent.parent
SVG = ROOT / "store-assets" / "svg"
OUT = ROOT / "store-assets"

# (source, target, width, height, keep the alpha channel)
JOBS = [
    ("logo.svg", ROOT / "icons" / "icon16.png", 16, 16, True),
    ("logo.svg", ROOT / "icons" / "icon48.png", 48, 48, True),
    ("logo.svg", ROOT / "icons" / "icon128.png", 128, 128, True),
    ("logo.svg", OUT / "store_logo_300.png", 300, 300, True),
    ("logo-flat.svg", OUT / "store_icon_128.png", 128, 128, False),
    ("screenshot-schedule.svg", OUT / "screenshot_schedule.png", 1280, 800, False),
    ("promo-small.svg", OUT / "small_promo_tile.png", 440, 280, False),
    ("promo-marquee.svg", OUT / "marquee_promo.png", 1400, 560, False),
    ("social-preview.svg", OUT / "github_social_preview.png", 1280, 640, False),
]


def render(source: str, target: Path, width: int, height: int, alpha: bool) -> None:
    png = cairosvg.svg2png(url=str(SVG / source), output_width=width, output_height=height)
    image = Image.open(BytesIO(png))
    # The stores want flat images (no alpha) for the screenshots and the promo tiles.
    image = image.convert("RGBA" if alpha else "RGB")
    image.save(target, optimize=True)
    print(f"wrote {target.relative_to(ROOT)} ({width}x{height})")


def main() -> None:
    for job in JOBS:
        render(*job)


if __name__ == "__main__":
    main()
